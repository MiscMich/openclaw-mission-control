import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiAuth";
import { OpenClawGatewayError } from "@/lib/openclaw/client";
import { getGatewayWsClient, type GatewayEventFrame } from "@/lib/openclaw/gatewayWsClient";

export const runtime = "nodejs";

const encoder = new TextEncoder();
const KEEPALIVE_MS = 5_000;

function trimString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ ok: false, error: "Failed to serialize payload" });
  }
}

async function handler(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sessionKey = trimString(url.searchParams.get("sessionKey")) ?? "";
    if (!sessionKey) {
      return NextResponse.json({ ok: false, error: "sessionKey is required" }, { status: 400 });
    }
    const runId = trimString(url.searchParams.get("runId"));
    const includeAgent = url.searchParams.get("includeAgent") !== "0";

    const client = getGatewayWsClient();
    await client.ensureConnected();

    const stream = new ReadableStream({
      start(controller) {
        let closed = false;
        let unsubscribeChat: (() => void) | null = null;
        let unsubscribeAgent: (() => void) | null = null;

        const safeEnqueue = (data: Uint8Array) => {
          if (closed) return;
          try {
            controller.enqueue(data);
          } catch {
            closed = true;
          }
        };

        const send = (payload: unknown) => {
          safeEnqueue(encoder.encode(`data: ${safeJson(payload)}\n\n`));
        };

        const matchesChatPayload = (payload: unknown): payload is { sessionKey?: unknown; runId?: unknown } => {
          return Boolean(payload && typeof payload === "object");
        };

        const handleChatEvent = (frame: GatewayEventFrame) => {
          const payload = frame.payload;
          if (!matchesChatPayload(payload)) return;
          if (payload.sessionKey !== sessionKey) return;
          if (runId && payload.runId !== runId) return;

          send({
            ok: true,
            event: "chat",
            payload,
            seq: frame.seq,
            stateVersion: frame.stateVersion,
            ts: Date.now(),
          });
        };

        const handleAgentEvent = (frame: GatewayEventFrame) => {
          const payload = frame.payload as unknown;
          if (!payload || typeof payload !== "object") return;
          const typed = payload as { sessionKey?: unknown };
          if (typed.sessionKey !== sessionKey) return;

          send({
            ok: true,
            event: "agent",
            payload,
            seq: frame.seq,
            stateVersion: frame.stateVersion,
            ts: Date.now(),
          });
        };

        unsubscribeChat = client.subscribe("chat", handleChatEvent);
        if (includeAgent) {
          unsubscribeAgent = client.subscribe("agent", handleAgentEvent);
        }

        const keepalive = setInterval(() => {
          // Try to keep the gateway connection warm while a browser tab is streaming.
          void client.ensureConnected().catch(() => undefined);
          safeEnqueue(encoder.encode(": keepalive\n\n"));
        }, KEEPALIVE_MS);

        send({
          ok: true,
          event: "connected",
          payload: { sessionKey, ...(runId ? { runId } : {}) },
          ts: Date.now(),
        });

        const cleanup = () => {
          clearInterval(keepalive);
          try {
            unsubscribeChat?.();
          } catch {
            // ignore
          }
          try {
            unsubscribeAgent?.();
          } catch {
            // ignore
          }
        };

        const safeClose = () => {
          if (closed) return;
          closed = true;
          cleanup();
          try {
            controller.close();
          } catch {
            // ignore
          }
        };

        request.signal.addEventListener("abort", safeClose, { once: true });
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof OpenClawGatewayError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status ?? 502 });
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to stream chat events" },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handler);

