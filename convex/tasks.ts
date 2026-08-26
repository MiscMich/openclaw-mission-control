import { authenticatedMutation as mutation, authenticatedQuery as query } from "./auth";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { api } from "./_generated/api";

const taskStatus = v.union(
  v.literal("open"),
  v.literal("inbox"),
  v.literal("assigned"),
  v.literal("in_progress"),
  v.literal("review"),
  v.literal("completed"),
  v.literal("done"),
  v.literal("blocked"),
  v.literal("failed"),
  v.literal("cancelled")
);

const priority = v.union(
  v.literal("low"),
  v.literal("normal"),
  v.literal("high"),
  v.literal("urgent")
);

const AGENT_ID_ALIASES: Record<string, string> = {
  main: "coordinator",
};

function canonicalAgentId(agentId: string) {
  return AGENT_ID_ALIASES[agentId] ?? agentId;
}

function normalizeAssigneeIds(assigneeId?: string, assigneeIds?: string[]) {
  const source =
    assigneeIds && assigneeIds.length > 0
      ? assigneeIds
      : assigneeId
        ? [assigneeId]
        : [];

  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const rawId of source) {
    if (!rawId) continue;
    const normalized = canonicalAgentId(rawId);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

export const list = query({
  args: {
    status: v.optional(v.string()),
    assigneeId: v.optional(v.string()),
    priority: v.optional(v.string()),
    search: v.optional(v.string()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 500;

    let queryBuilder;

    if (args.status) {
      queryBuilder = ctx.db
        .query("tasks")
        .withIndex("by_status", (q) =>
          q.eq("status", args.status as Doc<"tasks">["status"])
        );
    } else {
      queryBuilder = ctx.db.query("tasks");
    }

    // Get paginated results
    const result = args.cursor
      ? await queryBuilder.order("desc").paginate({ numItems: limit, cursor: args.cursor })
      : await queryBuilder.order("desc").paginate({ numItems: limit, cursor: null });
    let tasks = result.page;

    // Apply filters
    if (args.assigneeId) {
      const requestedAgentId = canonicalAgentId(args.assigneeId);
      tasks = tasks.filter((task) => {
        const ids = normalizeAssigneeIds(task.assigneeId, task.assigneeIds);
        return ids.includes(requestedAgentId);
      });
    }

    if (args.priority) {
      tasks = tasks.filter((task) => task.priority === args.priority);
    }

    if (args.search && args.search.length >= 2) {
      const searchLower = args.search.toLowerCase();
      tasks = tasks.filter((task) =>
        task.title.toLowerCase().includes(searchLower) ||
        task.description?.toLowerCase().includes(searchLower)
      );
    }

    // Fetch all agents in a single query to avoid N+1 problem
    const allAgents = await ctx.db.query("agents").collect();
    const agentsMap = new Map(
      allAgents.map((agent) => [
        agent.id,
        { id: agent.id, name: agent.name, emoji: agent.emoji },
      ])
    );

    // Use in-memory Map for joins instead of Promise.all loops
    const enrichedTasks = tasks.map((task) => {
      const assigneeIds = normalizeAssigneeIds(task.assigneeId, task.assigneeIds);

      const assignees = assigneeIds
        .map((assigneeId) => agentsMap.get(assigneeId))
        .filter(Boolean) as Array<{ id: string; name: string; emoji: string }>;

      const primaryAssignee = assignees[0] ?? null;

      return {
        ...task,
        assigneeIds,
        assignees,
        assigneeName: primaryAssignee?.name ?? null,
        assigneeEmoji: primaryAssignee?.emoji ?? null,
      };
    });

    return {
      tasks: enrichedTasks,
      hasMore: result.continueCursor !== null,
      cursor: result.continueCursor,
      total: enrichedTasks.length,
    };
  },
});

export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const task = await ctx.db
      .query("tasks")
      .withIndex("by_taskId", (q) => q.eq("id", args.id))
      .first();

    if (!task) return null;

    const assigneeIds = normalizeAssigneeIds(task.assigneeId, task.assigneeIds);

    const assignees = await Promise.all(
      assigneeIds.map(async (assigneeId) => {
        const agent = await ctx.db
          .query("agents")
          .withIndex("by_agentId", (q) => q.eq("id", assigneeId))
          .first();
        if (!agent) return null;
        return { id: agent.id, name: agent.name, emoji: agent.emoji };
      })
    );

    const primaryAssignee = assignees.find(Boolean) ?? null;

    return {
      ...task,
      assigneeIds,
      assignees: assignees.filter(Boolean),
      assigneeName: primaryAssignee?.name ?? null,
      assigneeEmoji: primaryAssignee?.emoji ?? null,
    };
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    sessionKey: v.optional(v.string()),
    priority,
    status: v.optional(taskStatus),
    requiresApproval: v.optional(v.boolean()),
    assigneeId: v.optional(v.string()),
    assigneeIds: v.optional(v.array(v.string())),
    suggestedAssignee: v.optional(v.string()),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = crypto.randomUUID();
    const now = Date.now();
    const assigneeIds = normalizeAssigneeIds(args.assigneeId, args.assigneeIds);

    await ctx.db.insert("tasks", {
      id,
      title: args.title,
      description: args.description,
      sessionKey: args.sessionKey,
      status: args.status ?? (assigneeIds.length > 0 ? "assigned" : "inbox"),
      requiresApproval: args.requiresApproval,
      priority: args.priority,
      assigneeId: assigneeIds[0],
      assigneeIds,
      suggestedAssignee: args.suggestedAssignee,
      createdBy: args.createdBy ?? "operator",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("activity", {
      id: crypto.randomUUID(),
      type: "task_created",
      message: `Task created: ${args.title}`,
      taskId: id,
      createdAt: now,
    });

    return { id };
  },
});

export const update = mutation({
  args: {
    id: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(taskStatus),
    requiresApproval: v.optional(v.boolean()),
    priority: v.optional(priority),
    assigneeId: v.optional(v.string()),
    assigneeIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db
      .query("tasks")
      .withIndex("by_taskId", (q) => q.eq("id", args.id))
      .first();

    if (!task) throw new Error(`Task ${args.id} not found`);

    const assigneeIds =
      args.assigneeIds !== undefined
        ? normalizeAssigneeIds(undefined, args.assigneeIds)
        : args.assigneeId !== undefined
          ? normalizeAssigneeIds(args.assigneeId)
          : normalizeAssigneeIds(task.assigneeId, task.assigneeIds);

    await ctx.db.patch(task._id, {
      title: args.title ?? task.title,
      description: args.description ?? task.description,
      status: args.status ?? task.status,
      requiresApproval: args.requiresApproval ?? task.requiresApproval,
      priority: args.priority ?? task.priority,
      assigneeId: assigneeIds[0],
      assigneeIds,
      updatedAt: Date.now(),
    });

    // Log activity for task updates
    const changes: string[] = [];
    if (args.title && args.title !== task.title) changes.push(`title to "${args.title}"`);
    if (args.status && args.status !== task.status) changes.push(`status to ${args.status}`);
    if (
      args.requiresApproval !== undefined &&
      args.requiresApproval !== task.requiresApproval
    ) {
      changes.push(`requiresApproval to ${args.requiresApproval}`);
    }
    if (args.priority && args.priority !== task.priority) changes.push(`priority to ${args.priority}`);

    if (changes.length > 0) {
      await ctx.db.insert("activity", {
        id: crypto.randomUUID(),
        type: "task_updated",
        message: `Task updated: ${changes.join(", ")}`,
        taskId: args.id,
        createdAt: Date.now(),
      });
    }

    return { ok: true };
  },
});

export const updateStatus = mutation({
  args: {
    id: v.string(),
    status: taskStatus,
    tokensUsed: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    output: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db
      .query("tasks")
      .withIndex("by_taskId", (q) => q.eq("id", args.id))
      .first();

    if (!task) throw new Error(`Task ${args.id} not found`);

    const oldStatus = task.status;

    await ctx.db.patch(task._id, {
      status: args.status,
      tokensUsed: args.tokensUsed ?? task.tokensUsed,
      costUsd: args.costUsd ?? task.costUsd,
      output: args.output ?? task.output,
      updatedAt: Date.now(),
    });

    // Log activity for status changes
    if (oldStatus !== args.status) {
      // Get agent name if task has an assignee
      let agentName = null;
      if (task.assigneeId) {
        const agent = await ctx.db
          .query("agents")
          .withIndex("by_agentId", (q) => q.eq("id", task.assigneeId!))
          .first();
        agentName = agent?.name ?? task.assigneeId;
      }

      const message = agentName
        ? `Task status changed from ${oldStatus} to ${args.status} by ${agentName}`
        : `Task status changed from ${oldStatus} to ${args.status}`;

      await ctx.db.insert("activity", {
        id: crypto.randomUUID(),
        type: "task_status_changed",
        message,
        taskId: args.id,
        agentId: task.assigneeId,
        createdAt: Date.now(),
      });
    }

    return { ok: true };
  },
});

export const setSessionKey = mutation({
  args: {
    id: v.string(),
    sessionKey: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db
      .query("tasks")
      .withIndex("by_taskId", (q) => q.eq("id", args.id))
      .first();

    if (!task) throw new Error(`Task ${args.id} not found`);

    await ctx.db.patch(task._id, {
      sessionKey: args.sessionKey,
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});

export const addUsage = mutation({
  args: {
    id: v.string(),
    tokensUsed: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    output: v.optional(v.string()),
    status: v.optional(taskStatus),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db
      .query("tasks")
      .withIndex("by_taskId", (q) => q.eq("id", args.id))
      .first();

    if (!task) throw new Error(`Task ${args.id} not found`);

    const currentTokens = task.tokensUsed ?? 0;
    const currentCost = task.costUsd ?? 0;

    await ctx.db.patch(task._id, {
      tokensUsed:
        args.tokensUsed !== undefined ? currentTokens + args.tokensUsed : task.tokensUsed,
      costUsd: args.costUsd !== undefined ? currentCost + args.costUsd : task.costUsd,
      output: args.output ?? task.output,
      status: args.status ?? task.status,
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});

export const assign = mutation({
  args: {
    id: v.string(),
    assigneeId: v.optional(v.string()),
    assigneeIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db
      .query("tasks")
      .withIndex("by_taskId", (q) => q.eq("id", args.id))
      .first();

    if (!task) throw new Error(`Task ${args.id} not found`);

    const assigneeIds = normalizeAssigneeIds(args.assigneeId, args.assigneeIds);

    await ctx.db.patch(task._id, {
      assigneeId: assigneeIds[0],
      assigneeIds,
      status: assigneeIds.length > 0 ? "assigned" : "inbox",
      updatedAt: Date.now(),
    });

    if (assigneeIds.length > 0) {
      // Get agent names for activity logging
      const agentNames = await Promise.all(
        assigneeIds.map(async (assigneeId) => {
          const agent = await ctx.db
            .query("agents")
            .withIndex("by_agentId", (q) => q.eq("id", assigneeId))
            .first();
          return agent?.name ?? assigneeId;
        })
      );

      await Promise.all(
        assigneeIds.map((assigneeId, idx) =>
          ctx.db.insert("activity", {
            id: crypto.randomUUID(),
            type: "task_assigned",
            message: `Task assigned to ${agentNames[idx]}`,
            agentId: assigneeId,
            taskId: args.id,
            createdAt: Date.now(),
          })
        )
      );

      await Promise.all(
        assigneeIds.map((assigneeId) =>
          ctx.runMutation(api.taskSubscriptions.add, {
            taskId: args.id,
            agentId: assigneeId,
          })
        )
      );

      await Promise.all(
        assigneeIds.map((assigneeId) =>
          ctx.runMutation(api.notifications.create, {
            agentId: assigneeId,
            taskId: args.id,
            content: `You were assigned to task ${task.title}`,
          })
        )
      );
    }

    return { ok: true };
  },
});

export const complete = mutation({
  args: {
    id: v.string(),
    tokensUsed: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    output: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db
      .query("tasks")
      .withIndex("by_taskId", (q) => q.eq("id", args.id))
      .first();

    if (!task) throw new Error(`Task ${args.id} not found`);

    await ctx.db.patch(task._id, {
      status: "done",
      tokensUsed: args.tokensUsed ?? task.tokensUsed,
      costUsd: args.costUsd ?? task.costUsd,
      output: args.output ?? task.output,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("activity", {
      id: crypto.randomUUID(),
      type: "task_completed",
      message: `Task completed: ${task.title}`,
      agentId: task.assigneeId,
      taskId: args.id,
      createdAt: Date.now(),
    });

    return { ok: true };
  },
});

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("tasks").first();
    if (existing) return "Tasks already exist - skipping seed";

    const now = Date.now();
    const tasks = [
      {
        title: "Set up CI/CD pipeline",
        description: "Configure GitHub Actions for automated testing and deployment",
        status: "inbox" as const,
        priority: "high" as const,
        assigneeId: undefined,
        createdBy: "operator",
      },
      {
        title: "Implement drag-and-drop Kanban",
        description: "Add drag-drop functionality...",
        status: "assigned" as const,
        priority: "high" as const,
        assigneeId: "builder",
        createdBy: "operator",
      },
      {
        title: "Design system documentation",
        description: "Document all UI components and design tokens",
        status: "in_progress" as const,
        priority: "normal" as const,
        assigneeId: "analyst",
        createdBy: "operator",
      },
      {
        title: "Security audit",
        description: "Review authentication and authorization implementation",
        status: "assigned" as const,
        priority: "urgent" as const,
        assigneeId: "verifier",
        createdBy: "operator",
      },
      {
        title: "Write API documentation",
        description: "Create OpenAPI spec for all endpoints",
        status: "inbox" as const,
        priority: "normal" as const,
        assigneeId: undefined,
        createdBy: "operator",
      },
      {
        title: "Performance optimization",
        description: "Profile and optimize slow database queries",
        status: "in_progress" as const,
        priority: "high" as const,
        assigneeId: "researcher",
        createdBy: "operator",
      },
    ];

    for (let index = 0; index < tasks.length; index += 1) {
      const task = tasks[index];
      const id = crypto.randomUUID();
      const assigneeIds = task.assigneeId ? [task.assigneeId] : [];
      await ctx.db.insert("tasks", {
        id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        assigneeId: task.assigneeId,
        assigneeIds,
        createdBy: task.createdBy,
        createdAt: now - (index + 1) * 60_000,
        updatedAt: now,
      });

      await ctx.db.insert("activity", {
        id: crypto.randomUUID(),
        type: "task_created",
        message: `Task created: ${task.title}`,
        taskId: id,
        agentId: task.assigneeId,
        createdAt: now - (index + 1) * 60_000,
      });
    }

    return `Seeded ${tasks.length} tasks with activity`;
  },
});

export const deleteTask = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const task = await ctx.db
      .query("tasks")
      .withIndex("by_taskId", (q) => q.eq("id", args.id))
      .first();

    if (!task) throw new Error(`Task ${args.id} not found`);

    await ctx.db.delete(task._id);
    return { ok: true, deleted: args.id };
  },
});

export const deleteByIdPrefix = mutation({
  args: { prefix: v.string() },
  handler: async (ctx, args) => {
    const tasks = await ctx.db.query("tasks").collect();
    const toDelete = tasks.filter((t) => t.id.startsWith(args.prefix));

    for (const task of toDelete) {
      await ctx.db.delete(task._id);
    }

    return { ok: true, deleted: toDelete.length };
  },
});

/**
 * List open/unassigned tasks for the swarm task pool
 * Used by SwarmDashboard TaskPool component
 */
export const listOpenTasks = query({
  args: {},
  handler: async (ctx) => {
    // Get tasks that are open or inbox (unassigned)
    const tasks = await ctx.db
      .query("tasks")
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "open"),
          q.eq(q.field("status"), "inbox")
        )
      )
      .order("desc")
      .collect();

    // Sort by priority: urgent > high > normal > low
    const priorityOrder: Record<string, number> = {
      urgent: 4,
      high: 3,
      normal: 2,
      low: 1,
    };

    const sortedTasks = tasks.sort((a, b) => {
      const priorityA = priorityOrder[a.priority ?? "normal"] ?? 2;
      const priorityB = priorityOrder[b.priority ?? "normal"] ?? 2;
      if (priorityA !== priorityB) return priorityB - priorityA;
      // If same priority, sort by creation date (newest first)
      return b.createdAt - a.createdAt;
    });

    // Enrich with suggested assignee info if available
    return await Promise.all(
      sortedTasks.map(async (task) => {
        let suggestedAssigneeInfo = null;

        if (task.suggestedAssignee) {
          const agent = await ctx.db
            .query("agents")
            .withIndex("by_agentId", (q) => q.eq("id", task.suggestedAssignee!))
            .first();

          if (agent) {
            suggestedAssigneeInfo = {
              id: agent.id,
              name: agent.name,
              emoji: agent.emoji,
            };
          }
        }

        return {
          ...task,
          suggestedAssigneeInfo,
        };
      })
    );
  },
});

/**
 * Claim an open/inbox task
 * Implements optimistic locking to prevent double-claiming race conditions
 */
export const claimTask = mutation({
  args: {
    taskId: v.string(),
    agentId: v.string(),
  },
  handler: async (ctx, args) => {
    const canonicalAssigneeId = canonicalAgentId(args.agentId);

    // 1. Get task
    const task = await ctx.db
      .query("tasks")
      .withIndex("by_taskId", (q) => q.eq("id", args.taskId))
      .first();

    if (!task) {
      throw new Error(`Task ${args.taskId} not found`);
    }

    // 2. Check if already assigned (prevent double-claim)
    if (task.assigneeId || (task.assigneeIds && task.assigneeIds.length > 0)) {
      throw new Error("Task already claimed");
    }

    // 3. Verify task is claimable (open or inbox status)
    if (task.status !== "open" && task.status !== "inbox") {
      throw new Error(
        `Task cannot be claimed (current status: ${task.status})`
      );
    }

    // 4. Assign task
    await ctx.db.patch(task._id, {
      assigneeId: canonicalAssigneeId,
      assigneeIds: [canonicalAssigneeId],
      status: "assigned",
      updatedAt: Date.now(),
    });

    // 5. Log activity with agent name
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_agentId", (q) => q.eq("id", canonicalAssigneeId))
      .first();
    const agentName = agent?.name ?? canonicalAssigneeId;

    await ctx.db.insert("activity", {
      id: crypto.randomUUID(),
      type: "task_claimed",
      message: `Task claimed by ${agentName}`,
      taskId: args.taskId,
      agentId: canonicalAssigneeId,
      createdAt: Date.now(),
    });

    // 6. Create task subscription
    await ctx.runMutation(api.taskSubscriptions.add, {
      taskId: args.taskId,
      agentId: canonicalAssigneeId,
    });

    // 7. Create notification for the agent
    await ctx.runMutation(api.notifications.create, {
      agentId: canonicalAssigneeId,
      taskId: args.taskId,
      content: `You claimed task: ${task.title}`,
    });

    return { ok: true };
  },
});
