import { NextRequest, NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { withAuth } from "@/lib/apiAuth";
import { dispatchOpenClawHeartbeat } from "@/lib/openclaw/heartbeat";
import { heartbeatIntervalMinutesFromPoll } from "@/lib/queue/heartbeat";

async function handler(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.taskId) {
      return NextResponse.json(
        { error: "Missing required field: taskId" },
        { status: 400 }
      );
    }

    if (!body.agentId) {
      return NextResponse.json(
        { error: "Missing required field: agentId" },
        { status: 400 }
      );
    }

    const result = await convex.mutation(api.tasks.claimTask, {
      taskId: body.taskId,
      agentId: body.agentId,
    });

    const dispatchResult = await dispatchOpenClawHeartbeat(
      body.agentId,
      `OpenClaw Mission Control task claim heartbeat: process newly claimed task ${body.taskId} now.`
    );

    return NextResponse.json({
      ...result,
      dispatched: dispatchResult.ok,
      dispatchError: dispatchResult.error,
      heartbeatIntervalMinutes: heartbeatIntervalMinutesFromPoll(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    // Handle specific error cases
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    if (message.includes("already claimed")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    if (message.includes("cannot be claimed")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    // Generic error
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handler);
