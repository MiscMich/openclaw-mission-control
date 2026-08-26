import { NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { withAuth } from "@/lib/apiAuth";
import { isCompletedTaskStatus } from "@/lib/tasks/status";

async function handler() {
  try {
    const [agents, tasksResult] = await Promise.all([
      convex.query(api.agents.listWithCurrentTask, {}),
      convex.query(api.tasks.list, {}),
    ]);

    const tasks = tasksResult?.tasks || [];

    const activeAgents = agents.filter((a) => a.status === "working").length;
    const idleAgents = agents.filter((a) => a.status === "idle").length;
    const offlineAgents = agents.filter((a) => a.status === "offline").length;

    const openTasks = tasks.filter(
      (t) => t.status === "open" || t.status === "inbox"
    ).length;
    const inProgressTasks = tasks.filter(
      (t) => t.status === "in_progress"
    ).length;
    const completedTasks = tasks.filter((t) => isCompletedTaskStatus(t.status)).length;

    return NextResponse.json({
      agents: {
        total: agents.length,
        active: activeAgents,
        idle: idleAgents,
        offline: offlineAgents,
        details: agents.map((a) => ({
          id: a.id,
          name: a.name,
          emoji: a.emoji,
          status: a.status,
          currentTask: a.currentTask,
          workload: a.workload,
          lastSeen: a.lastSeen,
        })),
      },
      tasks: {
        total: tasks.length,
        open: openTasks,
        inProgress: inProgressTasks,
        completed: completedTasks,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = withAuth(handler);
