import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiAuth";
import { OpenClawGatewayError } from "@/lib/openclaw/client";
import { getGatewayWsClient } from "@/lib/openclaw/gatewayWsClient";

export const runtime = "nodejs";

function trimString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

async function handler(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const sessionKey = trimString(body.sessionKey) ?? "";
    if (!sessionKey) {
      return NextResponse.json({ error: "sessionKey is required" }, { status: 400 });
    }
    const runId = trimString(body.runId);

    const client = getGatewayWsClient();
    await client.ensureConnected();

    const params: Record<string, unknown> = { sessionKey };
    if (runId) {
      params.runId = runId;
    }

    const result = await client.request("chat.abort", params, { timeoutMs: 8000 });

    return NextResponse.json({
      ok: true,
      ...(result && typeof result === "object" ? (result as object) : { result }),
    });
  } catch (error) {
    if (error instanceof OpenClawGatewayError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status ?? 502 });
    }
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to abort OpenClaw chat run",
      },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handler);

