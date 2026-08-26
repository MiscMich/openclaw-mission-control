import { NextResponse } from "next/server";
import { killAllSessions, OpenClawGatewayError } from "@/lib/openclaw/client";
import { triggerSessionsStreamRefresh } from "@/lib/realtime/sessionsStream";
import { withAuth } from "@/lib/apiAuth";

export async function GET() {
  return NextResponse.json({ method: "Use POST to kill all sessions" });
}

async function handler() {
  try {
    await killAllSessions();
    await triggerSessionsStreamRefresh("kill-all");
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof OpenClawGatewayError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status ?? 502 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to kill sessions" },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handler);
