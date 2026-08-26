import { NextRequest, NextResponse } from "next/server";
import { api, convex } from "@/lib/convexServer";
import { hasDashboardSession, validateApiKey } from "@/lib/apiAuth";
import { dispatchOpenClawHeartbeat } from "@/lib/openclaw/heartbeat";
import { heartbeatIntervalMinutesFromPoll } from "@/lib/queue/heartbeat";
import { isActiveTaskStatus } from "@/lib/tasks/status";

export const runtime = "nodejs";

function isAuthorizedRequest(request: NextRequest): boolean {
  const hasSession = hasDashboardSession(request);
  if (hasSession) return true;
  return validateApiKey(request);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    await convex.mutation(api.agents.updateLastSeen, { id });

    const tasksResult = await convex.query(api.tasks.list, { assigneeId: id });
    const notifications = await convex.query(api.notifications.listUndelivered, {
      agentId: id,
    });
    const activeTaskCount =
      tasksResult?.tasks?.filter((task) =>
        isActiveTaskStatus(task.status)
      ).length ?? 0;
    const notificationCount = notifications?.length ?? 0;

    let dispatched = false;
    let dispatchError = "";

    if (activeTaskCount > 0 || notificationCount > 0) {
      const result = await dispatchOpenClawHeartbeat(id);
      dispatched = result.ok;
      dispatchError = result.error ?? "";
    }

    try {
      await convex.mutation(api.activity.log, {
        type: "agent_heartbeat",
        message: `Manual heartbeat trigger: ${activeTaskCount} active tasks, ${notificationCount} notifications (${dispatched ? "dispatched" : "queued"})`,
        agentId: id,
      });
    } catch {
      // Do not fail the trigger request if activity logging fails.
    }

    return NextResponse.json({
      ok: true,
      agentId: id,
      tasks: activeTaskCount,
      notifications: notificationCount,
      dispatched,
      dispatchError,
      checkedAt: Date.now(),
      heartbeatIntervalMinutes: heartbeatIntervalMinutesFromPoll(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to trigger heartbeat",
      },
      { status: 500 }
    );
  }
}
