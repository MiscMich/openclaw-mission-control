import { NextResponse } from "next/server";
import { killSession, OpenClawGatewayError } from "@/lib/openclaw/client";
import { withAuth } from "@/lib/apiAuth";

export const runtime = "nodejs";

async function handler(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !/^[A-Za-z0-9:_./-]{1,128}$/.test(id)) {
      return NextResponse.json({ error: "Valid session id required" }, { status: 400 });
    }

    await killSession(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof OpenClawGatewayError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status ?? 502 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to kill session" },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handler);
