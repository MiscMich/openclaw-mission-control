import { internalMutation } from "./_generated/server";

const FIXTURE_TIME = 1_735_689_600_000;

const AGENTS = [
  { id: "coordinator", name: "Coordinator", emoji: "C", role: "Plans and routes work", model: "provider/model", status: "working" as const },
  { id: "builder", name: "Builder", emoji: "B", role: "Implements scoped changes", model: "provider/model", status: "working" as const },
  { id: "reviewer", name: "Reviewer", emoji: "R", role: "Checks quality and policy", model: "provider/model", status: "idle" as const },
  { id: "observer", name: "Observer", emoji: "O", role: "Tracks health and events", model: "provider/model", status: "idle" as const },
];

const TASKS = [
  { id: "fixture-task-1", title: "Prepare release notes", description: "Summarize public changes for a sample release.", status: "in_progress" as const, priority: "normal" as const, assigneeId: "builder", createdBy: "coordinator" },
  { id: "fixture-task-2", title: "Review access boundaries", description: "Verify the sample file and API policies.", status: "review" as const, priority: "high" as const, assigneeId: "reviewer", createdBy: "coordinator" },
  { id: "fixture-task-3", title: "Check service health", description: "Record deterministic sample health checks.", status: "completed" as const, priority: "low" as const, assigneeId: "observer", createdBy: "coordinator" },
];

async function replaceFixtures(ctx: any) {
  for (const table of ["agents", "tasks", "activity"] as const) {
    for (const row of await ctx.db.query(table).collect()) await ctx.db.delete(row._id);
  }

  for (let index = 0; index < AGENTS.length; index += 1) {
    await ctx.db.insert("agents", {
      ...AGENTS[index],
      currentTaskId: undefined,
      lastSeen: FIXTURE_TIME - index * 60_000,
      totalCost: 0,
      totalTokens: 0,
      todayCost: 0,
      todayTokens: 0,
      usageSyncedAt: FIXTURE_TIME,
    });
  }

  for (let index = 0; index < TASKS.length; index += 1) {
    const task = TASKS[index];
    await ctx.db.insert("tasks", {
      ...task,
      assigneeIds: [task.assigneeId],
      createdAt: FIXTURE_TIME - (index + 1) * 300_000,
      updatedAt: FIXTURE_TIME - index * 60_000,
    });
    await ctx.db.insert("activity", {
      id: `fixture-event-${index + 1}`,
      type: index === 2 ? "task_completed" : "task_status_change",
      message: `${task.title}: ${task.status}`,
      agentId: task.assigneeId,
      taskId: task.id,
      createdAt: FIXTURE_TIME - index * 60_000,
    });
  }

  return { agents: AGENTS.length, tasks: TASKS.length, activities: TASKS.length };
}

export const seed = internalMutation({ handler: replaceFixtures });
export const runSeed = internalMutation({ handler: replaceFixtures });
