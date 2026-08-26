import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiAuth";
import { collectSystemMonitoringSnapshot } from "@/lib/system/monitor";
import {
  buildFallbackMonitoringSnapshot,
  SYSTEM_SNAPSHOT_TIMEOUT_MS,
  withTimeout,
} from "@/lib/system/fastSnapshot";

export const runtime = "nodejs";

async function handler(_request: NextRequest) {
  void _request;
  try {
    const snapshot = await withTimeout(
      collectSystemMonitoringSnapshot(),
      SYSTEM_SNAPSHOT_TIMEOUT_MS,
      `System snapshot timed out after ${SYSTEM_SNAPSHOT_TIMEOUT_MS}ms`
    );
    return NextResponse.json({
      ok: true,
      ...snapshot,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Failed to collect system status";
    try {
      const fallback = await buildFallbackMonitoringSnapshot(reason);
      return NextResponse.json({
        ok: true,
        degraded: true,
        ...fallback,
      });
    } catch (fallbackError) {
      const fallbackReason =
        fallbackError instanceof Error ? fallbackError.message : "Failed to collect fallback status";
      return NextResponse.json(
        {
          ok: false,
          error: fallbackReason,
          checkedAt: Date.now(),
        },
        { status: 500 }
      );
    }
  }
}

export const GET = withAuth(handler);
