import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { convex, api } from "@/lib/convexServer";
import { getOpenClawHomeDir } from "@/lib/openclaw/paths";
import { OpenClawGatewayError } from "@/lib/openclaw/client";

type GatewayErrorShape = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  retryable?: unknown;
  retryAfterMs?: unknown;
};

type GatewayRequestFrame = {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
};

type GatewayResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: GatewayErrorShape;
};

export type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: unknown;
};

type GatewayFrame = GatewayRequestFrame | GatewayResponseFrame | GatewayEventFrame;

type PendingRequest = {
  resolve: (payload: unknown) => void;
  reject: (error: unknown) => void;
  timeout: NodeJS.Timeout;
};

type EventListener = (frame: GatewayEventFrame) => void;

type GatewayAuth = { token?: string; password?: string };

type ResolvedGatewayConnection = {
  wsUrl: string;
  auth: GatewayAuth;
};

async function resolveSettingValue(key: string): Promise<unknown> {
  try {
    const setting = await convex.query(api.settings.get, { key });
    return setting?.value;
  } catch {
    return undefined;
  }
}

function trimString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toWsUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return "ws://127.0.0.1:18789";
  }

  if (trimmed.startsWith("ws://") || trimmed.startsWith("wss://")) {
    return trimmed;
  }

  if (trimmed.startsWith("http://")) {
    return `ws://${trimmed.slice("http://".length)}`;
  }
  if (trimmed.startsWith("https://")) {
    return `wss://${trimmed.slice("https://".length)}`;
  }

  // Allow host:port shorthand.
  if (!trimmed.includes("://")) {
    return `ws://${trimmed}`;
  }

  return trimmed;
}

async function readGatewayAuthFromOpenClawConfig(): Promise<{
  url?: string;
  token?: string;
  password?: string;
}> {
  try {
    const configPath = path.join(getOpenClawHomeDir(), "openclaw.json");
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as {
      gateway?: {
        port?: unknown;
        auth?: { mode?: unknown; token?: unknown; password?: unknown };
        remote?: { url?: unknown; token?: unknown; password?: unknown };
      };
    };

    const port =
      typeof parsed.gateway?.port === "number" && Number.isFinite(parsed.gateway.port)
        ? parsed.gateway.port
        : undefined;

    const authToken = trimString(parsed.gateway?.auth?.token);
    const authPassword = trimString(parsed.gateway?.auth?.password);

    const remoteUrl = trimString(parsed.gateway?.remote?.url);
    const remoteToken = trimString(parsed.gateway?.remote?.token);
    const remotePassword = trimString(parsed.gateway?.remote?.password);

    const url = remoteUrl ?? (port ? `ws://127.0.0.1:${port}` : undefined);

    // Prefer explicit local auth, then remote creds.
    return {
      url,
      token: authToken ?? remoteToken,
      password: authPassword ?? remotePassword,
    };
  } catch {
    return {};
  }
}

async function resolveGatewayConnection(): Promise<ResolvedGatewayConnection> {
  const envUrl = trimString(process.env.OPENCLAW_GATEWAY_URL);
  const envToken = trimString(process.env.OPENCLAW_GATEWAY_TOKEN);
  const envPassword = trimString(process.env.OPENCLAW_GATEWAY_PASSWORD);

  const settingUrl = trimString(await resolveSettingValue("openclawGatewayUrl"));
  const settingToken = trimString(await resolveSettingValue("openclawToken"));

  const fromConfig = await readGatewayAuthFromOpenClawConfig();

  const urlCandidate = envUrl ?? settingUrl ?? fromConfig.url ?? "ws://127.0.0.1:18789";
  const wsUrl = toWsUrl(urlCandidate);

  const token = envToken ?? settingToken ?? fromConfig.token;
  const password = envPassword ?? fromConfig.password;

  return { wsUrl, auth: { token, password } };
}

function frameDataToString(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  }
  return String(data ?? "");
}

function errorFromGatewayShape(shape: GatewayErrorShape | undefined): OpenClawGatewayError {
  const message =
    typeof shape?.message === "string" && shape.message.trim()
      ? shape.message.trim()
      : "Gateway request failed";
  const code =
    typeof shape?.code === "string" && shape.code.trim() ? shape.code.trim() : undefined;
  const details = shape?.details;

  const suffix = code ? ` (${code})` : "";
  const err = new OpenClawGatewayError(`${message}${suffix}`, { status: 502 });
  (err as unknown as { details?: unknown }).details = details;
  return err;
}

export class GatewayWsClient {
  private ws: WebSocket | null = null;
  private ready = false;
  private connectInflight: Promise<void> | null = null;
  private pending = new Map<string, PendingRequest>();
  private listeners = new Map<string, Set<EventListener>>();
  private connectTimeout: NodeJS.Timeout | null = null;

  private async connect(): Promise<void> {
    const { wsUrl, auth } = await resolveGatewayConnection();

    const ws = new WebSocket(wsUrl);
    this.ws = ws;
    this.ready = false;

    ws.addEventListener("message", (event) => {
      const raw = frameDataToString(event.data);
      let parsed: GatewayFrame | null = null;
      try {
        parsed = JSON.parse(raw) as GatewayFrame;
      } catch {
        return;
      }

      if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
        return;
      }

      if (parsed.type === "res") {
        const id = (parsed as GatewayResponseFrame).id;
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        clearTimeout(pending.timeout);
        if ((parsed as GatewayResponseFrame).ok) {
          pending.resolve((parsed as GatewayResponseFrame).payload);
        } else {
          pending.reject(errorFromGatewayShape((parsed as GatewayResponseFrame).error));
        }
        return;
      }

      if (parsed.type === "event") {
        const evt = parsed as GatewayEventFrame;
        const subs = this.listeners.get(evt.event);
        if (subs) {
          for (const fn of subs) {
            try {
              fn(evt);
            } catch {
              // Ignore subscriber errors.
            }
          }
        }
      }
    });

    const handleClose = () => {
      this.ready = false;
      this.ws = null;
      if (this.connectTimeout) {
        clearTimeout(this.connectTimeout);
        this.connectTimeout = null;
      }

      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new OpenClawGatewayError("Gateway connection closed", { status: 502 }));
      }
      this.pending.clear();
    };

    ws.addEventListener("close", handleClose);
    ws.addEventListener("error", handleClose);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new OpenClawGatewayError("Gateway connection timeout", { status: 504 }));
      }, 10_000);

      ws.addEventListener(
        "open",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true }
      );

      ws.addEventListener(
        "error",
        () => {
          clearTimeout(timeout);
          reject(new OpenClawGatewayError("Gateway connection failed", { status: 502 }));
        },
        { once: true }
      );
    });

    // Perform connect handshake.
    const connectId = `connect-${randomUUID()}`;
    const payload = await this.request<{
      type?: unknown;
      protocol?: unknown;
      server?: unknown;
      features?: unknown;
    }>(
      "connect",
      {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: "gateway-client",
          displayName: "OpenClaw Mission Control",
          version: "openclaw-mission-control",
          platform: `node ${process.version}`,
          mode: "backend",
          instanceId: randomUUID(),
        },
        caps: ["tool-events"],
        role: "operator",
        scopes: ["operator.admin", "operator.approvals", "operator.pairing"],
        auth: auth.token || auth.password ? auth : undefined,
      },
      { requestId: connectId }
    );

    if (!payload || payload.type !== "hello-ok") {
      throw new OpenClawGatewayError("Gateway connect handshake failed", { status: 502 });
    }

    this.ready = true;
  }

  async ensureConnected(): Promise<void> {
    if (this.ready && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.connectInflight) {
      return this.connectInflight;
    }

    this.connectInflight = this.connect().finally(() => {
      this.connectInflight = null;
    });

    return this.connectInflight;
  }

  request<T = unknown>(
    method: string,
    params?: unknown,
    options?: { timeoutMs?: number; requestId?: string }
  ): Promise<T> {
    const timeoutMs = Math.max(1000, Math.floor(options?.timeoutMs ?? 10_000));
    const id = options?.requestId ?? randomUUID();

    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new OpenClawGatewayError("Gateway not connected", { status: 503 }));
    }

    const frame: GatewayRequestFrame = {
      type: "req",
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    };

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new OpenClawGatewayError(`Gateway request timeout: ${method}`, { status: 504 }));
      }, timeoutMs);

      this.pending.set(id, { resolve: resolve as (payload: unknown) => void, reject, timeout });

      try {
        ws.send(JSON.stringify(frame));
      } catch (err) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(
          err instanceof Error
            ? new OpenClawGatewayError(err.message, { status: 502 })
            : new OpenClawGatewayError("Failed to send gateway request", { status: 502 })
        );
      }
    });
  }

  subscribe(event: string, listener: EventListener): () => void {
    const set = this.listeners.get(event) ?? new Set<EventListener>();
    set.add(listener);
    this.listeners.set(event, set);
    return () => {
      const current = this.listeners.get(event);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        this.listeners.delete(event);
      }
    };
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __missionControlGatewayWsClient: GatewayWsClient | undefined;
}

export function getGatewayWsClient(): GatewayWsClient {
  if (!globalThis.__missionControlGatewayWsClient) {
    globalThis.__missionControlGatewayWsClient = new GatewayWsClient();
  }
  return globalThis.__missionControlGatewayWsClient;
}

