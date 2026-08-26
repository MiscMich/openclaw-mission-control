import { NextResponse } from "next/server";
import { getGatewayStatus, OpenClawGatewayError } from "@/lib/openclaw/client";

export const runtime = "nodejs";

export async function GET() {
  try {
    const status = await getGatewayStatus();
    return NextResponse.json({
      ok: true,
      running: status.running,
      port: status.port,
      checkedAt: Date.now(),
    });
  } catch (error) {
    if (error instanceof OpenClawGatewayError) {
      return NextResponse.json(
        { ok: false, running: false, error: error.message, checkedAt: Date.now() },
        { status: error.status ?? 502 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        running: false,
        error: error instanceof Error ? error.message : "Failed to check gateway status",
        checkedAt: Date.now(),
      },
      { status: 500 }
    );
  }
}
