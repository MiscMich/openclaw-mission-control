import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiAuth";
import {
  executeSystemControl,
} from "@/lib/system/control";
import { parseSystemControlCommand } from "@/lib/security/control";
import { readBoundedJsonObject, RequestBoundaryError } from "@/lib/security/request";

export const runtime = "nodejs";

async function handler(request: NextRequest) {
  try {
    const payload = await readBoundedJsonObject(request, 4 * 1024);
    const command = parseSystemControlCommand(payload);
    const result = await executeSystemControl(command);
    return NextResponse.json({
      ok: true,
      command,
      ...result,
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to execute control command",
        timestamp: Date.now(),
      },
      { status: error instanceof RequestBoundaryError ? error.status : 400 }
    );
  }
}

export const POST = withAuth(handler);
