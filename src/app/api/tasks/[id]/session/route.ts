import { NextRequest, NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { withAuth } from "@/lib/apiAuth";

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body.sessionKey || typeof body.sessionKey !== "string") {
      return NextResponse.json(
        { error: "sessionKey is required and must be a string" },
        { status: 400 }
      );
    }

    await convex.mutation(api.tasks.setSessionKey, {
      id,
      sessionKey: body.sessionKey,
    });

    return NextResponse.json({
      ok: true,
      taskId: id,
      sessionKey: body.sessionKey,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withAuth(handler);
export const PATCH = withAuth(handler);
