import { NextRequest, NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { withAuth } from "@/lib/apiAuth";
import { TASK_STATUS_VALUES, isTaskStatus } from "@/lib/tasks/status";

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body.status) {
      return NextResponse.json(
        { error: "Missing required field: status" },
        { status: 400 }
      );
    }

    if (!isTaskStatus(body.status)) {
      return NextResponse.json(
        {
          error: `Invalid status. Must be one of: ${TASK_STATUS_VALUES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const requestedStatus = body.status;
    let statusToWrite = requestedStatus;
    let needsApprovalNotificationTitle: string | null = null;

    if (requestedStatus === "done" || requestedStatus === "completed") {
      const task = await convex.query(api.tasks.getById, { id });
      if (!task) {
        return NextResponse.json({ error: `Task ${id} not found` }, { status: 404 });
      }

      if (task.requiresApproval === true) {
        statusToWrite = "review";
        needsApprovalNotificationTitle = task.title;
      }
    }

    const result = await convex.mutation(api.tasks.updateStatus, {
      id,
      status: statusToWrite,
      tokensUsed: body.tokensUsed,
      costUsd: body.costUsd,
      output: body.output,
    });

    if (needsApprovalNotificationTitle) {
      await convex.mutation(api.notifications.create, {
        agentId: "coordinator",
        taskId: id,
        content: `Task needs approval: ${needsApprovalNotificationTitle}`,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withAuth(handler);
