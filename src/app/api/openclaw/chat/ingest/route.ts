import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiAuth";
import { convex, api } from "@/lib/convexServer";
import { canonicalAgentId } from "@/lib/agents/identity";
import {
  listSessions,
  OpenClawGatewayError,
} from "@/lib/openclaw/client";
import { getGatewayWsClient } from "@/lib/openclaw/gatewayWsClient";
import { createHash } from "node:crypto";

export const runtime = "nodejs";

const OPERATOR_ID = "operator";
const DEFAULT_CURSOR_LOOKBACK_MS = 2 * 60 * 60 * 1000;
const REPLAY_WINDOW_MS = 10_000;
const CONVEX_DEDUPE_WINDOW_MS = 5_000;

function sha1Hex(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function inferChannel(sessionKey: string): string {
  const key = sessionKey.toLowerCase();
  if (key.includes(":telegram:")) return "telegram";
  if (key.includes(":signal:")) return "signal";
  if (key.includes(":whatsapp:")) return "whatsapp";
  return "gateway";
}

function trimString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function inferAgentIdFromSessionKey(sessionKey: string): string {
  const match = sessionKey.match(/^agent:([^:]+):/i);
  if (!match?.[1]) return "unknown";
  return canonicalAgentId(match[1]);
}

type GatewayHistoryMessage = {
  role?: unknown;
  content?: unknown;
  timestamp?: unknown;
};

async function fetchGatewayHistory(sessionKey: string, limit: number): Promise<{ messages: GatewayHistoryMessage[] }> {
  const client = getGatewayWsClient();
  await client.ensureConnected();
  const payload = await client.request("chat.history", { sessionKey, limit }, { timeoutMs: 10_000 });
  const obj = payload && typeof payload === "object" ? (payload as { messages?: unknown }) : null;
  if (!obj || !Array.isArray(obj.messages)) {
    throw new OpenClawGatewayError("Invalid chat history payload", { status: 502 });
  }
  return { messages: obj.messages as GatewayHistoryMessage[] };
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const typedBlock = block as { type?: unknown; text?: unknown };
      if (typedBlock.type !== "text") continue;
      if (typeof typedBlock.text !== "string") continue;
      const trimmed = typedBlock.text.trim();
      if (!trimmed) continue;
      parts.push(trimmed);
    }
    return parts.join("\n").trim();
  }

  return "";
}

async function handler(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const requestedSessionKey = trimString(body?.sessionKey);
    const requestedAgentId = trimString(body?.agentId);

    const requestedLimitRaw = body?.limit;
    const requestedLimit =
      typeof requestedLimitRaw === "number" && Number.isFinite(requestedLimitRaw)
        ? Math.max(1, Math.min(1000, Math.floor(requestedLimitRaw)))
        : 200;

    const sessions = requestedSessionKey ? [] : await listSessions();

    const sessionsToScan: Array<{ key: string; agent: string }> = requestedSessionKey
      ? [
          {
            key: requestedSessionKey,
            agent: canonicalAgentId(requestedAgentId ?? inferAgentIdFromSessionKey(requestedSessionKey)),
          },
        ]
      : sessions
          .filter((session) => {
            const key = session.key.toLowerCase();
            return (
              key.includes(":telegram:") ||
              key.includes(":signal:") ||
              key.includes(":whatsapp:")
            );
          })
          .map((session) => ({ key: session.key, agent: session.agent }));

    const perSession: Array<{
      sessionKey: string;
      agentId: string;
      channel: string;
      lastTimestamp: number;
      cursorTimestamp?: number;
      maxSeenTimestamp?: number;
      scannedMessages: number;
      eligibleMessages: number;
      insertedMessages: number;
      skippedMessages: number;
      ignoredMessages: number;
    }> = [];

    const errors: Array<{ sessionKey: string; error: string }> = [];

    let insertedMessages = 0;
    let skippedMessages = 0;

    for (const session of sessionsToScan) {
      const sessionKey = session.key;
      const channel = inferChannel(sessionKey);
      const cursorKey = `externalChatCursor:${sessionKey}`;
      const agentId = canonicalAgentId(session.agent);

      const sessionSummary: (typeof perSession)[number] = {
        sessionKey,
        agentId,
        channel,
        lastTimestamp: 0,
        cursorTimestamp: undefined,
        maxSeenTimestamp: undefined,
        scannedMessages: 0,
        eligibleMessages: 0,
        insertedMessages: 0,
        skippedMessages: 0,
        ignoredMessages: 0,
      };

      try {
        const cursorSetting = await convex.query(api.settings.get, {
          key: cursorKey,
        });
        const storedLastTimestamp = (
          cursorSetting?.value as { lastTimestamp?: unknown } | undefined
        )?.lastTimestamp;
        const lastTimestamp = isFiniteNumber(storedLastTimestamp)
          ? storedLastTimestamp
          : Date.now() - DEFAULT_CURSOR_LOOKBACK_MS;
        sessionSummary.lastTimestamp = lastTimestamp;

        // Fetch recent Convex messages for this session so we can dedupe
        // MC-sent messages that will also appear in gateway history.
        const existingConvexMessages = await convex.query(api.agentMessages.listBySessionKey, {
          sessionKey,
          limit: 400,
        });
        const existingFingerprintToTimestamps = new Map<string, number[]>();
        for (const msg of existingConvexMessages ?? []) {
          const content = typeof msg?.content === "string" ? msg.content.trim() : "";
          if (!content) continue;
          const from = typeof msg?.fromAgentId === "string" ? msg.fromAgentId : "";
          const to = typeof msg?.toAgentId === "string" ? msg.toAgentId : "";
          const ts = typeof msg?.createdAt === "number" && Number.isFinite(msg.createdAt) ? msg.createdAt : undefined;
          if (!from || ts === undefined) continue;
          const fp = `${from}|${to}|${sha1Hex(content)}`;
          const arr = existingFingerprintToTimestamps.get(fp) ?? [];
          arr.push(ts);
          existingFingerprintToTimestamps.set(fp, arr);
        }

        const history = await fetchGatewayHistory(sessionKey, requestedLimit);
        sessionSummary.scannedMessages = history.messages.length;

        let maxSeenTimestamp: number | undefined;
        for (const message of history.messages) {
          if (isFiniteNumber(message.timestamp)) {
            maxSeenTimestamp =
              maxSeenTimestamp === undefined
                ? message.timestamp
                : Math.max(maxSeenTimestamp, message.timestamp);
          }
        }
        sessionSummary.maxSeenTimestamp = maxSeenTimestamp;

        const threshold = lastTimestamp - REPLAY_WINDOW_MS;
        const sessionKeyHash = sha1Hex(sessionKey).slice(0, 12);

        for (const message of history.messages) {
          const role = message.role;
          if (role !== "user" && role !== "assistant") {
            sessionSummary.ignoredMessages += 1;
            continue;
          }

          const timestamp = message.timestamp;
          if (!isFiniteNumber(timestamp) || !(timestamp > threshold)) {
            sessionSummary.ignoredMessages += 1;
            continue;
          }

          const extractedText = extractTextFromContent(message.content);
          if (!extractedText) {
            sessionSummary.ignoredMessages += 1;
            continue;
          }

          sessionSummary.eligibleMessages += 1;

          const fromAgentId = role === "user" ? OPERATOR_ID : agentId;
          const toAgentId = role === "user" ? agentId : OPERATOR_ID;

          // If MC already stored this message into Convex (random id), skip ingesting
          // the gateway copy to avoid duplicates in Convex-backed thread view.
          const fp = `${fromAgentId}|${toAgentId ?? ""}|${sha1Hex(extractedText)}`;
          const existing = existingFingerprintToTimestamps.get(fp);
          if (existing) {
            const hasMatch = existing.some(
              (existingTs) => Math.abs(existingTs - timestamp) <= CONVEX_DEDUPE_WINDOW_MS
            );
            if (hasMatch) {
              skippedMessages += 1;
              sessionSummary.skippedMessages += 1;
              continue;
            }
          }

          const contentHash = sha1Hex(extractedText).slice(0, 12);
          const id = `ext:${channel}:${sessionKeyHash}:${timestamp}:${role}:${contentHash}`;

          const result = await convex.mutation(api.agentMessages.ingestExternal, {
            id,
            fromAgentId,
            toAgentId,
            content: extractedText,
            createdAt: timestamp,
            sessionKey,
            channel,
          });

          if (result?.inserted) {
            insertedMessages += 1;
            sessionSummary.insertedMessages += 1;
          } else {
            skippedMessages += 1;
            sessionSummary.skippedMessages += 1;
          }
        }

        const newCursorTimestamp = maxSeenTimestamp ?? lastTimestamp;
        sessionSummary.cursorTimestamp = newCursorTimestamp;
        await convex.mutation(api.settings.set, {
          key: cursorKey,
          value: { lastTimestamp: newCursorTimestamp },
        });
      } catch (error) {
        errors.push({
          sessionKey,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      perSession.push(sessionSummary);
    }

    return NextResponse.json({
      ok: true,
      scannedSessions: sessionsToScan.length,
      insertedMessages,
      skippedMessages,
      perSession,
      errors,
    });
  } catch (error) {
    if (error instanceof OpenClawGatewayError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status ?? 502 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to ingest external OpenClaw chat history",
      },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handler);
