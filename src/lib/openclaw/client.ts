import type {
  GatewayChatHistoryResponse,
  GatewayChatSendResponse,
  SessionInfo,
  SpawnResponse,
} from "./types";
import { convex, api } from "@/lib/convexServer";
import { spawn } from "node:child_process";
import path from "node:path";
import { canonicalAgentId, openClawAgentStoreId } from "@/lib/agents/identity";
import { getDefaultAgentsDir } from "@/lib/openclaw/paths";

export const DEFAULT_GATEWAY_URL = "http://127.0.0.1:18789";

function parseAgentFromSessionKey(key: string): string {
  const match = key.match(/^agent:([^:]+):/i);
  if (!match) return "unknown";
  return canonicalAgentId(match[1]);
}

function resolveAgentStoreDirectory(agentId: string): string {
  return openClawAgentStoreId(agentId);
}

async function resolveSettingValue(key: string): Promise<unknown> {
  try {
    const setting = await convex.query(api.settings.get, { key });
    return setting?.value;
  } catch {
    return undefined;
  }
}

export class OpenClawGatewayError extends Error {
  status?: number;

  constructor(message: string, opts?: { status?: number }) {
    super(message);
    this.name = "OpenClawGatewayError";
    this.status = opts?.status;
  }
}

function runCommand(
  command: string,
  args: string[],
  options?: { timeoutMs?: number; env?: NodeJS.ProcessEnv }
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options?.timeoutMs,
      env: options?.env ?? process.env,
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 0 });
    });

    child.on("error", (err) => {
      resolve({ stdout, stderr: err.message, code: 1 });
    });
  });
}

const GATEWAY_STATUS_CACHE_TTL_MS = 15000;
let gatewayStatusCache:
  | { expiresAt: number; value: { running: boolean; port?: number } }
  | null = null;
let gatewayStatusInflight:
  | Promise<{ running: boolean; port?: number }>
  | null = null;
const SESSIONS_CACHE_TTL_MS = 5000;
const STALE_SESSIONS_CACHE_MAX_AGE_MS = toPositiveInt(
  process.env.OPENCLAW_STALE_SESSIONS_CACHE_MAX_AGE_MS,
  45000
);
let sessionsCache:
  | { expiresAt: number; cachedAt: number; value: SessionInfo[] }
  | null = null;
let sessionsInflight: Promise<SessionInfo[]> | null = null;

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

const STORE_SESSIONS_TIMEOUT_MS = toPositiveInt(
  process.env.OPENCLAW_STORE_SESSIONS_TIMEOUT_MS,
  2200
);
const DEFAULT_SESSIONS_TIMEOUT_MS = toPositiveInt(
  process.env.OPENCLAW_DEFAULT_SESSIONS_TIMEOUT_MS,
  5000
);
const STORE_FALLBACK_MAX_DIRS_RAW = Number(process.env.OPENCLAW_STORE_FALLBACK_MAX_DIRS);
const STORE_FALLBACK_MAX_DIRS =
  Number.isFinite(STORE_FALLBACK_MAX_DIRS_RAW) && STORE_FALLBACK_MAX_DIRS_RAW > 0
    ? Math.floor(STORE_FALLBACK_MAX_DIRS_RAW)
    : Number.POSITIVE_INFINITY;
const GATEWAY_SESSIONS_TIMEOUT_MS = toPositiveInt(
  process.env.OPENCLAW_GATEWAY_SESSIONS_TIMEOUT_MS,
  2500
);
const GATEWAY_SESSIONS_BACKOFF_MS = toPositiveInt(
  process.env.OPENCLAW_GATEWAY_SESSIONS_BACKOFF_MS,
  15000
);
const STATUS_FALLBACK_TIMEOUT_MS = toPositiveInt(
  process.env.OPENCLAW_SESSIONS_STATUS_TIMEOUT_MS,
  4000
);
const GATEWAY_STATUS_TIMEOUT_MS = toPositiveInt(
  process.env.OPENCLAW_GATEWAY_STATUS_TIMEOUT_MS,
  1800
);
const GATEWAY_STATUS_PROBE_TIMEOUT_MS = toPositiveInt(
  process.env.OPENCLAW_GATEWAY_STATUS_PROBE_TIMEOUT_MS,
  1200
);
const NO_PROBE_UNSUPPORTED_PATTERN = /unknown option|unknown argument|unrecognized option|--no-probe/i;

let gatewaySessionsBackoffUntil = 0;

export function invalidateSessionsCache() {
  sessionsCache = null;
}

function getStaleSessionsCache(): SessionInfo[] | null {
  if (!sessionsCache) return null;
  const ageMs = Date.now() - sessionsCache.cachedAt;
  if (ageMs > STALE_SESSIONS_CACHE_MAX_AGE_MS) return null;
  return sessionsCache.value;
}

function shouldBackoffGatewaySessions(errorText?: string): boolean {
  const value = (errorText ?? "").toLowerCase();
  if (!value) return false;
  return (
    value.includes("timeout") ||
    value.includes("timed out") ||
    value.includes("closed before connect") ||
    value.includes("gateway client stopped") ||
    value.includes("econnrefused") ||
    value.includes("502")
  );
}

async function getOpenClawCli(): Promise<string> {
  if (process.env.OPENCLAW_CLI) {
    return process.env.OPENCLAW_CLI;
  }
  const fromSettings = await resolveSettingValue("openclawCli");
  if (typeof fromSettings === "string" && fromSettings.trim()) {
    return fromSettings;
  }
  return "openclaw";
}

export type OpenClawGatewayConnection = {
  gatewayUrl?: string;
  gatewayToken?: string;
};

function trimString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function getOpenClawGatewayConnection(): Promise<OpenClawGatewayConnection> {
  const settingGatewayUrl = trimString(
    await resolveSettingValue("openclawGatewayUrl")
  );
  const settingGatewayToken = trimString(
    await resolveSettingValue("openclawToken")
  );

  const envGatewayUrl = trimString(process.env.OPENCLAW_GATEWAY_URL);
  const envGatewayToken = trimString(process.env.OPENCLAW_GATEWAY_TOKEN);

  const gatewayUrl = envGatewayUrl ?? settingGatewayUrl;
  const gatewayToken = envGatewayToken ?? settingGatewayToken;

  // OpenClaw gateway CLI requires explicit credentials when --url is provided.
  // If no token is configured, allow CLI defaults/service config instead of forcing --url.
  if (gatewayUrl && !gatewayToken) {
    return {
      gatewayUrl: undefined,
      gatewayToken: undefined,
    };
  }

  return {
    gatewayUrl,
    gatewayToken,
  };
}

function withGatewayFlags(
  args: string[],
  connection: OpenClawGatewayConnection
): string[] {
  const merged = [...args];
  if (connection.gatewayUrl) {
    merged.push("--url", connection.gatewayUrl);
  }
  if (connection.gatewayToken) {
    merged.push("--token", connection.gatewayToken);
  }
  return merged;
}

function buildOpenClawEnv(connection: OpenClawGatewayConnection): NodeJS.ProcessEnv {
  // We’ve observed noisy Node deprecation warnings (punycode) bubbling up through the CLI
  // which can cause wrappers to exit non-zero / treat stderr as fatal. Suppress warnings
  // for OpenClaw CLI invocations to reduce spurious 502s.
  const existingNodeOptions = process.env.NODE_OPTIONS ?? "";
  const suppressWarningsFlags = "--no-deprecation --no-warnings";
  const nodeOptions = existingNodeOptions.includes("--no-warnings")
    ? existingNodeOptions
    : `${existingNodeOptions} ${suppressWarningsFlags}`.trim();

  return {
    ...process.env,
    NODE_NO_WARNINGS: "1",
    ...(nodeOptions ? { NODE_OPTIONS: nodeOptions } : {}),
    ...(connection.gatewayUrl ? { OPENCLAW_GATEWAY_URL: connection.gatewayUrl } : {}),
    ...(connection.gatewayToken ? { OPENCLAW_GATEWAY_TOKEN: connection.gatewayToken } : {}),
  };
}

type RawSessionRecord = {
  key?: unknown;
  sessionId?: unknown;
  updatedAt?: unknown;
  ageMs?: unknown;
  age?: unknown;
  model?: unknown;
  totalTokens?: unknown;
  inputTokens?: unknown;
  outputTokens?: unknown;
  agentId?: unknown;
};

type GatewaySessionRow = {
  key?: unknown;
  sessionId?: unknown;
  updatedAt?: unknown;
  model?: unknown;
  inputTokens?: unknown;
  outputTokens?: unknown;
  totalTokens?: unknown;
};

type GatewaySessionsListPayload = {
  sessions?: unknown;
  payload?: {
    sessions?: unknown;
  };
};

function parseJsonObject<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeGatewaySessionRows(raw: string): GatewaySessionRow[] {
  const parsed = parseJsonObject<GatewaySessionsListPayload>(raw);
  if (!parsed) return [];

  const directSessions = Array.isArray(parsed.sessions)
    ? parsed.sessions
    : Array.isArray(parsed.payload?.sessions)
      ? parsed.payload.sessions
      : null;
  if (!directSessions) return [];

  return directSessions.filter(
    (row): row is GatewaySessionRow => Boolean(row && typeof row === "object")
  );
}

function toSessionInfoFromGatewayRow(row: GatewaySessionRow): SessionInfo | null {
  const key = typeof row.key === "string" ? row.key : null;
  if (!key) return null;

  const now = Date.now();
  const updatedAt = toFiniteNumber(row.updatedAt) ?? now;
  const ageMs = Math.max(now - updatedAt, 0);
  const status = ageMs <= 60_000 ? "running" : "idle";
  const sessionId = typeof row.sessionId === "string" ? row.sessionId : undefined;
  const model = typeof row.model === "string" ? row.model : undefined;
  const inputTokens = toFiniteNumber(row.inputTokens);
  const outputTokens = toFiniteNumber(row.outputTokens);
  const totalTokens = toFiniteNumber(row.totalTokens);

  return {
    id: sessionId ?? key,
    key,
    status,
    agent: parseAgentFromSessionKey(key),
    startedAt: Math.max(updatedAt - ageMs, 0),
    updatedAt,
    ageMs,
    ...(model ? { model } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  };
}

function buildGatewayCallArgs(
  method: string,
  params: Record<string, unknown>,
  connection: OpenClawGatewayConnection
): string[] {
  return withGatewayFlags(
    ["gateway", "call", method, "--params", JSON.stringify(params), "--json"],
    connection
  );
}

function parseSessionsPayload(stdout: string): RawSessionRecord[] {
  const raw = stdout.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { sessions?: unknown } | unknown[];
    if (Array.isArray(parsed)) return parsed as RawSessionRecord[];
    if (Array.isArray(parsed.sessions)) return parsed.sessions as RawSessionRecord[];
    return [];
  } catch {
    return [];
  }
}

function toSessionInfo(
  record: RawSessionRecord,
  fallbackAgentId?: string
): SessionInfo | null {
  const now = Date.now();
  const key = typeof record.key === "string" ? record.key : null;
  if (!key) return null;

  const updatedAt =
    typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : now;
  const ageFromAgeMs =
    typeof record.ageMs === "number" && Number.isFinite(record.ageMs)
      ? record.ageMs
      : undefined;
  const ageFromAge =
    typeof record.age === "number" && Number.isFinite(record.age)
      ? record.age
      : undefined;
  const ageMs = ageFromAgeMs ?? ageFromAge ?? Math.max(now - updatedAt, 0);
  const startedAt = Math.max(updatedAt - ageMs, 0);
  const status = ageMs <= 60_000 ? "running" : "idle";

  const sessionId = typeof record.sessionId === "string" ? record.sessionId : undefined;
  const model = typeof record.model === "string" ? record.model : undefined;
  const totalTokens =
    typeof record.totalTokens === "number" && Number.isFinite(record.totalTokens)
      ? record.totalTokens
      : undefined;
  const inputTokens =
    typeof record.inputTokens === "number" && Number.isFinite(record.inputTokens)
      ? record.inputTokens
      : undefined;
  const outputTokens =
    typeof record.outputTokens === "number" && Number.isFinite(record.outputTokens)
      ? record.outputTokens
      : undefined;

  const rawAgentId =
    typeof record.agentId === "string"
      ? record.agentId
      : fallbackAgentId ?? parseAgentFromSessionKey(key);

  return {
    id: sessionId ?? key,
    key,
    agent: canonicalAgentId(rawAgentId),
    status,
    startedAt,
    updatedAt,
    ageMs,
    ...(sessionId ? { sessionId } : {}),
    ...(model ? { model } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
  };
}

function dedupeSessionsByRecency(sessions: SessionInfo[]): SessionInfo[] {
  const map = new Map<string, SessionInfo>();
  for (const session of sessions) {
    const existing = map.get(session.key);
    if (!existing || session.updatedAt > existing.updatedAt) {
      map.set(session.key, session);
    }
  }
  return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

async function getAgentStoreDirectories(): Promise<string[]> {
  const fromConvex = await convex.query(api.agents.list, {}).catch(() => []);
  const directories = new Set<string>();

  if (Array.isArray(fromConvex)) {
    for (const item of fromConvex) {
      if (!item || typeof item !== "object") continue;
      const id = (item as { id?: unknown }).id;
      if (typeof id !== "string" || !id.trim()) continue;
      directories.add(resolveAgentStoreDirectory(id));
    }
  }

  // Always include main because OpenClaw uses it as a canonical store.
  directories.add("main");
  return [...directories];
}

async function readStoreSessions(
  cli: string,
  env: NodeJS.ProcessEnv,
  storeDirectory: string,
  activeMinutes: number
): Promise<{ ok: boolean; sessions: SessionInfo[] }> {
  const storePath = path.join(
    getDefaultAgentsDir(),
    storeDirectory,
    "sessions",
    "sessions.json"
  );
  const result = await runCommand(
    cli,
    ["sessions", "--json", "--active", String(activeMinutes), "--store", storePath],
    {
      env,
      timeoutMs: STORE_SESSIONS_TIMEOUT_MS,
    }
  );
  if (result.code !== 0) {
    return { ok: false, sessions: [] };
  }

  const canonicalId = canonicalAgentId(storeDirectory);
  const sessions = parseSessionsPayload(result.stdout)
    .map((record) => toSessionInfo(record, canonicalId))
    .filter((session): session is SessionInfo => Boolean(session));
  return { ok: true, sessions };
}

async function listSessionsFromStores(
  cli: string,
  env: NodeJS.ProcessEnv,
  activeMinutes = 60
): Promise<{ ok: boolean; sessions: SessionInfo[] }> {
  const directories = await getAgentStoreDirectories();
  const prioritized = [...directories].sort((a, b) => {
    if (a === "main") return -1;
    if (b === "main") return 1;
    return 0;
  });
  const limited = Number.isFinite(STORE_FALLBACK_MAX_DIRS)
    ? prioritized.slice(0, STORE_FALLBACK_MAX_DIRS)
    : prioritized;
  const results: Array<{ ok: boolean; sessions: SessionInfo[] }> = [];
  for (const directory of limited) {
    // Sequential fallback avoids spawning a process storm when gateway is degraded.
    results.push(await readStoreSessions(cli, env, directory, activeMinutes));
  }

  const ok = results.some((result) => result.ok);
  const sessions = dedupeSessionsByRecency(
    results.flatMap((result) => result.sessions)
  );
  return { ok, sessions };
}

async function listSessionsViaGatewayCall(
  cli: string,
  connection: OpenClawGatewayConnection,
  env: NodeJS.ProcessEnv
): Promise<{ ok: boolean; sessions: SessionInfo[]; error?: string }> {
  const requestedLimit = Math.max(
    50,
    Number(process.env.OPENCLAW_SESSION_LIST_LIMIT ?? 500)
  );
  const activeMinutesRaw = Number(process.env.OPENCLAW_SESSIONS_ACTIVE_MINUTES ?? 0);
  const activeMinutes =
    Number.isFinite(activeMinutesRaw) && activeMinutesRaw > 0
      ? Math.floor(activeMinutesRaw)
      : undefined;

  const params: Record<string, unknown> = {
    limit: requestedLimit,
    includeGlobal: true,
    includeUnknown: true,
  };
  if (activeMinutes) {
    params.activeMinutes = activeMinutes;
  }

  const args = buildGatewayCallArgs("sessions.list", params, connection);
  const result = await runCommand(cli, args, {
    env,
    timeoutMs: GATEWAY_SESSIONS_TIMEOUT_MS,
  });
  if (result.code !== 0) {
    return {
      ok: false,
      sessions: [],
      error: result.stderr || "gateway sessions.list failed",
    };
  }

  const rows = normalizeGatewaySessionRows(result.stdout);
  const sessions = dedupeSessionsByRecency(
    rows
      .map((row) => toSessionInfoFromGatewayRow(row))
      .filter((row): row is SessionInfo => Boolean(row))
  );

  return { ok: true, sessions };
}

async function getLatestSessionForAgent(
  cli: string,
  env: NodeJS.ProcessEnv,
  agentId: string
): Promise<SessionInfo | null> {
  const storeDirectory = resolveAgentStoreDirectory(agentId);
  const result = await readStoreSessions(cli, env, storeDirectory, 1440);
  if (!result.ok || result.sessions.length === 0) {
    return null;
  }
  return result.sessions.reduce((latest, current) =>
    current.updatedAt > latest.updatedAt ? current : latest
  );
}

export async function resolveOpenClawExecutionContext(): Promise<{
  cli: string;
  connection: OpenClawGatewayConnection;
  env: NodeJS.ProcessEnv;
}> {
  const cli = await getOpenClawCli();
  const connection = await getOpenClawGatewayConnection();
  return {
    cli,
    connection,
    env: buildOpenClawEnv(connection),
  };
}

export async function spawnSession(
  agent: string,
  prompt: string,
  label?: string
): Promise<SpawnResponse> {
  const openClawAgentId = openClawAgentStoreId(agent);
  const cli = await getOpenClawCli();
  const connection = await getOpenClawGatewayConnection();
  const commandEnv = buildOpenClawEnv(connection);
  
  // Generate a unique session label for traceability (OpenClaw may reuse existing session keys).
  const requestedSessionId = label || `task-${Date.now()}`;
  
  // Use openclaw agent command to run an agent turn
  // The agent flag routes to a specific agent
  // The session-id groups the conversation
  const args = [
    "agent",
    "--agent", openClawAgentId,
    "--session-id", requestedSessionId,
    "--message", prompt,
    "--json",
  ];

  const result = await runCommand(cli, args, { env: commandEnv });
  
  // Note: non-zero exit may still have valid output (e.g., agent errors)
  // We try to parse JSON regardless
  
  let parsed: Record<string, unknown> = {};
  try {
    if (result.stdout.trim()) {
      parsed = JSON.parse(result.stdout);
    }
  } catch {
    // Non-JSON output
  }

  const parsedStatus =
    typeof parsed.status === "string" ? parsed.status.toLowerCase() : "";
  const isParsedSuccess = parsedStatus === "ok" || parsedStatus === "success";

  if (result.code !== 0 && !isParsedSuccess) {
    throw new OpenClawGatewayError(
      result.stderr || "Failed to spawn session",
      { status: 500 }
    );
  }

  const parsedResult = parsed.result as
    | {
        payloads?: Array<{ text?: unknown }>;
        meta?: {
          agentMeta?: { sessionId?: unknown };
          systemPromptReport?: { sessionKey?: unknown };
        };
      }
    | undefined;
  const payloadText = Array.isArray(parsedResult?.payloads)
    ? parsedResult.payloads
        .map((payload) =>
          typeof payload?.text === "string" ? payload.text : null
        )
        .filter((value): value is string => Boolean(value))
        .join("\n")
    : "";

  const parsedSessionId =
    typeof parsedResult?.meta?.agentMeta?.sessionId === "string"
      ? parsedResult.meta.agentMeta.sessionId
      : typeof parsed.sessionId === "string"
        ? parsed.sessionId
        : undefined;
  const parsedSessionKey =
    typeof parsedResult?.meta?.systemPromptReport?.sessionKey === "string"
      ? parsedResult.meta.systemPromptReport.sessionKey
      : typeof parsed.sessionKey === "string"
        ? parsed.sessionKey
        : undefined;

  const latestSession = await getLatestSessionForAgent(cli, commandEnv, agent);
  const sessionId = parsedSessionId ?? latestSession?.sessionId ?? requestedSessionId;
  const sessionKey =
    parsedSessionKey ??
    latestSession?.key ??
    `agent:${resolveAgentStoreDirectory(agent)}:main`;

  invalidateSessionsCache();

  return {
    ...parsed,
    sessionId,
    sessionKey,
    status: parsedStatus || "spawned",
    output: payloadText || String(result.stdout ?? ""),
  };
}

export async function getGatewayChatHistory(
  sessionKey: string,
  options?: { limit?: number }
): Promise<GatewayChatHistoryResponse> {
  const normalizedSessionKey = sessionKey.trim();
  if (!normalizedSessionKey) {
    throw new OpenClawGatewayError("sessionKey is required", { status: 400 });
  }

  const cli = await getOpenClawCli();
  const connection = await getOpenClawGatewayConnection();
  const commandEnv = buildOpenClawEnv(connection);
  const limitRaw = Number(options?.limit ?? 80);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 80;

  const args = buildGatewayCallArgs(
    "chat.history",
    { sessionKey: normalizedSessionKey, limit },
    connection
  );
  const result = await runCommand(cli, args, { env: commandEnv, timeoutMs: 10000 });

  // Prefer parsing stdout when possible even if the CLI returns a non-zero exit code.
  // (We have observed cases where Node warnings land in stderr and the wrapper exits non-zero,
  // but stdout still contains a valid JSON payload.)
  const parsed = parseJsonObject<GatewayChatHistoryResponse>(result.stdout.trim());
  if (parsed && Array.isArray(parsed.messages)) {
    return parsed;
  }

  if (result.code !== 0) {
    throw new OpenClawGatewayError(
      result.stderr || "Failed to fetch chat history",
      { status: 502 }
    );
  }

  throw new OpenClawGatewayError("Failed to parse chat history payload", {
    status: 500,
  });
}

export async function sendGatewayChatMessage(
  sessionKey: string,
  message: string,
  options?: { deliver?: boolean; timeoutMs?: number; idempotencyKey?: string }
): Promise<GatewayChatSendResponse> {
  const normalizedSessionKey = sessionKey.trim();
  if (!normalizedSessionKey) {
    throw new OpenClawGatewayError("sessionKey is required", { status: 400 });
  }

  const normalizedMessage = message.trim();
  if (!normalizedMessage) {
    throw new OpenClawGatewayError("message is required", { status: 400 });
  }

  const cli = await getOpenClawCli();
  const connection = await getOpenClawGatewayConnection();
  const commandEnv = buildOpenClawEnv(connection);
  const idempotencyKey =
    options?.idempotencyKey?.trim() ||
    `openclaw-mission-control-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const deliver = options?.deliver ?? false;
  const timeoutMs =
    options?.timeoutMs !== undefined ? Math.max(0, Math.floor(options.timeoutMs)) : undefined;

  const params: Record<string, unknown> = {
    sessionKey: normalizedSessionKey,
    message: normalizedMessage,
    deliver,
    idempotencyKey,
  };
  if (timeoutMs !== undefined) {
    params.timeoutMs = timeoutMs;
  }

  const args = buildGatewayCallArgs("chat.send", params, connection);
  const result = await runCommand(cli, args, { env: commandEnv, timeoutMs: 10000 });

  // Similar to chat.history: if stdout is valid JSON, prefer returning it even if the CLI
  // reports a non-zero exit code due to noisy stderr output.
  const parsed = parseJsonObject<GatewayChatSendResponse>(result.stdout.trim());
  if (parsed && (typeof parsed.runId === "string" || typeof parsed.status === "string")) {
    invalidateSessionsCache();
    return parsed;
  }

  if (result.code !== 0) {
    throw new OpenClawGatewayError(
      result.stderr || "Failed to send chat message",
      { status: 502 }
    );
  }

  throw new OpenClawGatewayError("Failed to parse chat send response", {
    status: 500,
  });
}

export async function listSessions(options?: { forceFresh?: boolean }): Promise<SessionInfo[]> {
  if (options?.forceFresh) {
    invalidateSessionsCache();
  }

  if (sessionsCache && Date.now() < sessionsCache.expiresAt) {
    return sessionsCache.value;
  }
  if (sessionsInflight) {
    return sessionsInflight;
  }

  const inflight = (async (): Promise<SessionInfo[]> => {
    const cli = await getOpenClawCli();
    const connection = await getOpenClawGatewayConnection();
    const commandEnv = buildOpenClawEnv(connection);
    const now = Date.now();
    const canCallGateway = now >= gatewaySessionsBackoffUntil;

    // Primary source of truth: gateway sessions.list (matches OpenClaw docs/control UI semantics).
    const fromGateway = canCallGateway
      ? await listSessionsViaGatewayCall(
          cli,
          connection,
          commandEnv
        )
      : {
          ok: false as const,
          sessions: [] as SessionInfo[],
          error: "gateway sessions.list temporarily paused after recent timeout",
        };
    if (fromGateway.ok) {
      gatewaySessionsBackoffUntil = 0;
      const cachedAt = Date.now();
      sessionsCache = {
        expiresAt: cachedAt + SESSIONS_CACHE_TTL_MS,
        cachedAt,
        value: fromGateway.sessions,
      };
      return fromGateway.sessions;
    }
    if (canCallGateway && shouldBackoffGatewaySessions(fromGateway.error)) {
      gatewaySessionsBackoffUntil = Date.now() + GATEWAY_SESSIONS_BACKOFF_MS;
    }

    // Gracefully serve a recent stale snapshot when the gateway briefly stalls.
    const staleSessions = getStaleSessionsCache();
    if (staleSessions) {
      return staleSessions;
    }

    // Fallback to default sessions command.
    const result = await runCommand(
      cli,
      ["sessions", "--json", "--active", "60"],
      {
        env: commandEnv,
        timeoutMs: DEFAULT_SESSIONS_TIMEOUT_MS,
      }
    );
    if (result.code === 0) {
      const sessions = parseSessionsPayload(result.stdout)
        .map((record) => toSessionInfo(record))
        .filter((session): session is SessionInfo => Boolean(session));
      const deduped = dedupeSessionsByRecency(sessions);
      const cachedAt = Date.now();
      sessionsCache = {
        expiresAt: cachedAt + SESSIONS_CACHE_TTL_MS,
        cachedAt,
        value: deduped,
      };
      return deduped;
    }

    // Secondary fallback: aggregate per-agent session stores.
    const fromStores = await listSessionsFromStores(cli, commandEnv, 60);
    if (fromStores.ok) {
      const cachedAt = Date.now();
      sessionsCache = {
        expiresAt: cachedAt + SESSIONS_CACHE_TTL_MS,
        cachedAt,
        value: fromStores.sessions,
      };
      return fromStores.sessions;
    }

    // Final fallback: gateway status RPC.
    const statusArgs = withGatewayFlags(
      ["gateway", "call", "status", "--json"],
      connection
    );
    const fallback = await runCommand(cli, statusArgs, {
      env: commandEnv,
      timeoutMs: STATUS_FALLBACK_TIMEOUT_MS,
    });
    if (fallback.code !== 0) {
      const stale = getStaleSessionsCache();
      if (stale) {
        return stale;
      }
      throw new OpenClawGatewayError(
        fromGateway.error ||
          result.stderr ||
          fallback.stderr ||
          "Failed to list sessions",
        { status: 500 }
      );
    }

    try {
      const payload = JSON.parse(fallback.stdout) as {
        sessions?: {
          recent?: RawSessionRecord[];
        };
      };
      const recent = Array.isArray(payload.sessions?.recent)
        ? payload.sessions.recent
        : [];
      const normalized = recent
        .map((record) => toSessionInfo(record))
        .filter((session): session is SessionInfo => Boolean(session));
      const deduped = dedupeSessionsByRecency(normalized);
      const cachedAt = Date.now();
      sessionsCache = {
        expiresAt: cachedAt + SESSIONS_CACHE_TTL_MS,
        cachedAt,
        value: deduped,
      };
      return deduped;
    } catch {
      const stale = getStaleSessionsCache();
      if (stale) {
        return stale;
      }
      throw new OpenClawGatewayError("Failed to parse gateway session status", {
        status: 500,
      });
    }
  })();
  sessionsInflight = inflight;

  try {
    return await inflight;
  } finally {
    if (sessionsInflight === inflight) {
      sessionsInflight = null;
    }
  }
}

export async function killSession(sessionId: string): Promise<void> {
  throw new OpenClawGatewayError(
    `Killing a single session is not supported by OpenClaw CLI (requested: ${sessionId})`,
    { status: 501 }
  );
}

export async function killAllSessions(): Promise<void> {
  const cli = await getOpenClawCli();
  const connection = await getOpenClawGatewayConnection();
  const commandEnv = buildOpenClawEnv(connection);
  const args = withGatewayFlags(["gateway", "restart"], connection);

  const result = await runCommand(cli, args, { env: commandEnv });
  if (result.code !== 0) {
    throw new OpenClawGatewayError(
      result.stderr || "Failed to restart OpenClaw gateway",
      { status: 500 }
    );
  }
  invalidateSessionsCache();
  gatewayStatusCache = null;
}

function resolveHttpProbeUrl(
  connection: OpenClawGatewayConnection,
  parsedPort?: number
): string {
  const fallback = `http://127.0.0.1:${parsedPort ?? 18789}`;
  if (!connection.gatewayUrl) return fallback;

  try {
    const candidate = new URL(connection.gatewayUrl);
    if (candidate.protocol === "ws:") {
      candidate.protocol = "http:";
    } else if (candidate.protocol === "wss:") {
      candidate.protocol = "https:";
    } else if (candidate.protocol !== "http:" && candidate.protocol !== "https:") {
      return fallback;
    }
    return `${candidate.origin}/`;
  } catch {
    return fallback;
  }
}

async function probeGatewayHttp(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GATEWAY_STATUS_PROBE_TIMEOUT_MS);
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    return response.ok || response.status === 401 || response.status === 403;
  } catch {
    return false;
  }
}

export async function getGatewayStatus(): Promise<{ running: boolean; port?: number }> {
  if (gatewayStatusCache && Date.now() < gatewayStatusCache.expiresAt) {
    return gatewayStatusCache.value;
  }
  if (gatewayStatusInflight) {
    return gatewayStatusInflight;
  }

  gatewayStatusInflight = (async () => {
    const cli = await getOpenClawCli();
    const connection = await getOpenClawGatewayConnection();
    const commandEnv = buildOpenClawEnv(connection);
    const fastArgs = withGatewayFlags(
      [
        "gateway",
        "status",
        "--json",
        "--no-probe",
        "--timeout",
        String(GATEWAY_STATUS_PROBE_TIMEOUT_MS),
      ],
      connection
    );
    let result = await runCommand(cli, fastArgs, {
      timeoutMs: GATEWAY_STATUS_TIMEOUT_MS,
      env: commandEnv,
    });
    if (result.code !== 0 && NO_PROBE_UNSUPPORTED_PATTERN.test(result.stderr)) {
      // Older CLI versions may not support --no-probe.
      // Avoid a second slow status command and rely on HTTP probe fallback below.
      result = {
        ...result,
        code: 0,
        stderr: "",
      };
    }
    const output = result.stdout.trim();

    let running = false;
    let port: number | undefined;

    if (output) {
      try {
        const parsed = JSON.parse(output) as {
          service?: { runtime?: { status?: string; state?: string } };
          gateway?: { port?: number };
          port?: { status?: string; listeners?: unknown[] };
          rpc?: { ok?: boolean };
        };
        running =
          parsed.rpc?.ok === true ||
          parsed.service?.runtime?.status === "running" ||
          parsed.service?.runtime?.state === "active" ||
          (parsed.port?.status === "busy" &&
            Array.isArray(parsed.port?.listeners) &&
            parsed.port.listeners.length > 0);
        if (typeof parsed.gateway?.port === "number") {
          port = parsed.gateway.port;
        }
      } catch {
        running = output.includes("running") || output.includes("active");
        const portMatch = output.match(/port[:\s]+(\d+)/i);
        port = portMatch ? parseInt(portMatch[1], 10) : undefined;
      }
    }

    if (!running) {
      // Some CLI/runtime combinations can fail the status probe while the gateway still serves HTTP.
      const probeUrl = resolveHttpProbeUrl(connection, port);
      running = await probeGatewayHttp(probeUrl);
    }

    if (!running && result.code !== 0) {
      throw new OpenClawGatewayError(
        result.stderr || "Failed to inspect OpenClaw gateway status",
        { status: 500 }
      );
    }

    const status = {
      running,
      port,
    };
    gatewayStatusCache = {
      expiresAt: Date.now() + GATEWAY_STATUS_CACHE_TTL_MS,
      value: status,
    };

    return status;
  })();

  try {
    return await gatewayStatusInflight;
  } finally {
    gatewayStatusInflight = null;
  }
}
