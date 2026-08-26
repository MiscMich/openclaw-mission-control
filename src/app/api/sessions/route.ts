import { NextRequest, NextResponse } from "next/server";
import { listSessions, OpenClawGatewayError } from "@/lib/openclaw/client";
import { withAuth } from "@/lib/apiAuth";

async function handler(request: NextRequest) {
  void request;
  try {
    const sessions = await listSessions();
    return NextResponse.json(sessions);
  } catch (error) {
    if (error instanceof OpenClawGatewayError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status ?? 502 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list sessions" },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handler);
