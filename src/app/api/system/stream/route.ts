import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiAuth";
import { collectSystemMonitoringSnapshot, type MonitoringSnapshot } from "@/lib/system/monitor";
import {
  buildFallbackMonitoringSnapshot,
  SYSTEM_SNAPSHOT_TIMEOUT_MS,
  withTimeout,
} from "@/lib/system/fastSnapshot";

export const runtime = "nodejs";

const encoder = new TextEncoder();
const STREAM_INTERVAL_MS = Number(process.env.SYSTEM_STREAM_INTERVAL_MS ?? 5000);
const KEEPALIVE_MS = 15000;

async function handler(request: NextRequest) {
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let lastSnapshot: MonitoringSnapshot | null = null;

      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
        }
      };

      const safeClose = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      const send = (payload: unknown) => {
        safeEnqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      const tick = async () => {
        try {
          const snapshot = await withTimeout(
            collectSystemMonitoringSnapshot(),
            SYSTEM_SNAPSHOT_TIMEOUT_MS,
            `System snapshot timed out after ${SYSTEM_SNAPSHOT_TIMEOUT_MS}ms`
          );
          lastSnapshot = snapshot;
          send({ ok: true, ...snapshot });
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Failed to collect system status";
          try {
            const base = lastSnapshot ?? (await buildFallbackMonitoringSnapshot(reason));
            const errors = Array.from(new Set([...(base.openclaw.errors ?? []), reason])).slice(0, 3);
            const degradedSnapshot = {
              ...base,
              checkedAt: Date.now(),
              openclaw: {
                ...base.openclaw,
                errors,
              },
            };
            lastSnapshot = degradedSnapshot;
            send({ ok: true, degraded: true, ...degradedSnapshot });
          } catch {
            send({
              ok: false,
              error: reason,
              checkedAt: Date.now(),
            });
          }
        }
      };

      void tick();

      const interval = setInterval(() => {
        void tick();
      }, STREAM_INTERVAL_MS);
      const keepalive = setInterval(() => {
        safeEnqueue(encoder.encode(": keepalive\n\n"));
      }, KEEPALIVE_MS);

      const cleanup = () => {
        clearInterval(interval);
        clearInterval(keepalive);
        safeClose();
      };

      request.signal.addEventListener("abort", cleanup, { once: true });
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
}

export const GET = withAuth(handler);
