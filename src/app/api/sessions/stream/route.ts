import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiAuth";
import {
  subscribeSessionsStream,
  triggerSessionsStreamRefresh,
} from "@/lib/realtime/sessionsStream";

export const runtime = "nodejs";

const encoder = new TextEncoder();
const KEEPALIVE_MS = 15000;

async function handler(request: NextRequest) {
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

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

      let unsubscribe: (() => void) | null = null;

      void subscribeSessionsStream((payload) => {
        send(payload);
      }).then((unsub) => {
        if (closed) {
          unsub();
          return;
        }
        unsubscribe = unsub;
      });

      void triggerSessionsStreamRefresh("client-connect");

      const keepalive = setInterval(() => {
        safeEnqueue(encoder.encode(": keepalive\n\n"));
      }, KEEPALIVE_MS);

      const cleanup = () => {
        clearInterval(keepalive);
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
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
