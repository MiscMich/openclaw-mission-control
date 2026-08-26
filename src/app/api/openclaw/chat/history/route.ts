import { NextRequest, NextResponse } from "next/server";
import {
  OpenClawGatewayError,
} from "@/lib/openclaw/client";
import { withAuth } from "@/lib/apiAuth";
import { getGatewayWsClient } from "@/lib/openclaw/gatewayWsClient";

export const runtime = "nodejs";

// Lightweight in-memory cache to reduce repeated gateway/CLI calls.
// This protects the gateway when multiple clients/components request the same thread.
// NOTE: In serverless this is best-effort; in long-lived Node (dev/launchd) it helps a lot.
const HISTORY_CACHE_TTL_MS = 2500;
type HistoryCacheEntry = {
  expiresAt: number;
  value: unknown;
  inFlight?: Promise<unknown>;
};

const historyCache: Map<string, HistoryCacheEntry> = (() => {
  const globalForCache = globalThis as typeof globalThis & {
    __openclawHistoryCache?: Map<string, HistoryCacheEntry>;
  };
  if (!globalForCache.__openclawHistoryCache) {
    globalForCache.__openclawHistoryCache = new Map();
  }
  return globalForCache.__openclawHistoryCache;
})();

function cacheKey(sessionKey: string, limit?: number) {
  return `${sessionKey}::${limit ?? "default"}`;
}

async function handler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionKey = searchParams.get("sessionKey")?.trim() ?? "";
    if (!sessionKey) {
      return NextResponse.json(
        { error: "sessionKey is required" },
        { status: 400 }
      );
    }

    const limitRaw = searchParams.get("limit");
    const limitCandidate = limitRaw ? Number(limitRaw) : undefined;
    const limit =
      typeof limitCandidate === "number" && Number.isFinite(limitCandidate)
        ? Math.max(1, Math.min(1000, Math.floor(limitCandidate)))
        : undefined;

    const key = cacheKey(sessionKey, limit);
    const now = Date.now();
    const cachedEntry = historyCache.get(key);

    // Serve fresh cache.
    if (cachedEntry && cachedEntry.expiresAt > now) {
      return NextResponse.json({
        ok: true,
        cached: true,
        ...(cachedEntry.value as object),
      });
    }

    // Dedupe concurrent callers.
    if (cachedEntry?.inFlight) {
      const awaited = await cachedEntry.inFlight;
      return NextResponse.json({
        ok: true,
        cached: false,
        ...(awaited as object),
      });
    }

    const inFlight = (async () => {
      const client = getGatewayWsClient();
      await client.ensureConnected();
      const params: Record<string, unknown> = { sessionKey };
      if (limit !== undefined) {
        params.limit = limit;
      }
      const payload = await client.request("chat.history", params, { timeoutMs: 8000 });
      const history =
        payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
      const messages = history && Array.isArray((history as { messages?: unknown }).messages)
        ? (history as { messages: unknown[] }).messages
        : null;
      if (!history || !messages) {
        throw new OpenClawGatewayError("Invalid chat history payload", { status: 502 });
      }
      return history;
    })()
      .then((history) => {
        historyCache.set(key, {
          expiresAt: Date.now() + HISTORY_CACHE_TTL_MS,
          value: history,
        });
        return history;
      })
      .catch((err) => {
        // If the gateway call fails, don’t poison cache with an error.
        const current = historyCache.get(key);
        if (current?.inFlight === inFlight) {
          historyCache.delete(key);
        }
        throw err;
      });

    historyCache.set(key, {
      expiresAt: 0,
      value: undefined,
      inFlight,
    });

    const history = await inFlight;

    return NextResponse.json({
      ok: true,
      cached: false,
      ...history,
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
            : "Failed to fetch OpenClaw chat history",
      },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handler);
