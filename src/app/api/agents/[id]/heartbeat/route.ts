import { NextRequest, NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { withAuth } from "@/lib/apiAuth";
import { heartbeatIntervalMinutesFromPoll } from "@/lib/queue/heartbeat";
import { isActiveTaskStatus } from "@/lib/tasks/status";

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existingAgent = await convex.query(api.agents.getById, { id });
    const previousStatus =
      typeof existingAgent?.status === "string" ? existingAgent.status : null;
    const previousCurrentTaskId =
      typeof existingAgent?.currentTaskId === "string"
        ? existingAgent.currentTaskId
        : "";

    await convex.mutation(api.agents.updateLastSeen, {
      id,
    });

    if (body.status) {
      const validStatuses = ["idle", "working", "offline", "error"];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          {
            error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
          },
          { status: 400 }
        );
      }
    }

    if (body.tokensUsed || body.costUsd) {
      await convex.mutation(api.agents.addUsage, {
        id,
        tokensUsed: body.tokensUsed,
        costUsd: body.costUsd,
      });
    }

    // Query tasks assigned to this agent
    const tasksResult = await convex.query(api.tasks.list, {
      assigneeId: id,
    });
    const assignedTasks = (tasksResult?.tasks || []).filter((task) =>
      isActiveTaskStatus(task.status)
    );

    // Query undelivered notifications for this agent
    const notifications = await convex.query(api.notifications.listUndelivered, {
      agentId: id,
    });

    if (body.status) {
      let normalizedStatus = body.status;
      if (body.status === "working" && assignedTasks.length === 0) {
        normalizedStatus = "idle";
      }
      if (
        (body.status === "idle" || body.status === "working") &&
        assignedTasks.length > 0
      ) {
        normalizedStatus = "working";
      }
      const requestedCurrentTaskId =
        typeof body.currentTaskId === "string" ? body.currentTaskId.trim() : "";
      const requestedTaskIsAssigned = requestedCurrentTaskId
        ? assignedTasks.some((task) => task.id === requestedCurrentTaskId)
        : false;
      const normalizedCurrentTaskId =
        assignedTasks.length === 0
          ? ""
          : requestedTaskIsAssigned
            ? requestedCurrentTaskId
            : assignedTasks[0]?.id ?? "";

      await convex.mutation(api.agents.updateStatus, {
        id,
        status: normalizedStatus,
        currentTaskId: normalizedCurrentTaskId,
      });

      const statusChanged =
        previousStatus !== null && previousStatus !== normalizedStatus;
      const taskChanged = previousCurrentTaskId !== normalizedCurrentTaskId;

      if (statusChanged || taskChanged) {
        const taskIdForActivity = normalizedCurrentTaskId || undefined;

        let message = "";
        if (statusChanged && taskChanged) {
          message = `Status changed: ${previousStatus} → ${normalizedStatus} (taskId: ${normalizedCurrentTaskId || "none"})`;
        } else if (statusChanged) {
          message = `Status changed: ${previousStatus} → ${normalizedStatus}`;
        } else {
          message = `Task changed: ${previousCurrentTaskId || "none"} → ${normalizedCurrentTaskId || "none"} (taskId: ${normalizedCurrentTaskId || "none"})`;
        }

        try {
          await convex.mutation(api.activity.log, {
            type: "agent_status_changed",
            message,
            agentId: id,
            taskId: taskIdForActivity,
          });
        } catch {
          // Avoid failing heartbeat requests when activity logging fails.
        }
      }
    }

    return NextResponse.json({
      ok: true,
      agentId: id,
      timestamp: Date.now(),
      tasks: assignedTasks,
      notifications: notifications || [],
      heartbeatIntervalMinutes: heartbeatIntervalMinutesFromPoll(),
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
