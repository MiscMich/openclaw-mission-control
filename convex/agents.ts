import { authenticatedMutation as mutation, authenticatedQuery as query } from "./auth";
import { v } from "convex/values";

const AGENT_ID_ALIASES: Record<string, string> = {
  main: "coordinator",
};

type AgentShape = {
  id: string;
  name: string;
  emoji: string;
  status: string;
  lastSeen?: number;
  totalTokens?: number;
  totalCost?: number;
};

function canonicalAgentId(agentId: string): string {
  return AGENT_ID_ALIASES[agentId] ?? agentId;
}

function normalizeAgent<T extends AgentShape>(agent: T): T {
  const canonicalId = canonicalAgentId(agent.id);
  if (canonicalId === agent.id) return agent;
  return {
    ...agent,
    id: canonicalId,
    name: canonicalId === "coordinator" ? "COORDINATOR" : agent.name,
    emoji: canonicalId === "coordinator" ? "T" : agent.emoji,
  };
}

function pickPreferredAgent<T extends AgentShape>(current: T, incoming: T): T {
  const currentLastSeen = current.lastSeen ?? 0;
  const incomingLastSeen = incoming.lastSeen ?? 0;
  if (incomingLastSeen !== currentLastSeen) {
    return incomingLastSeen > currentLastSeen ? incoming : current;
  }

  const currentTokens = current.totalTokens ?? 0;
  const incomingTokens = incoming.totalTokens ?? 0;
  if (incomingTokens !== currentTokens) {
    return incomingTokens > currentTokens ? incoming : current;
  }

  return current;
}

function dedupeAgents<T extends AgentShape>(agents: T[]): T[] {
  const orderedIds: string[] = [];
  const merged = new Map<string, T>();

  for (const rawAgent of agents) {
    const agent = normalizeAgent(rawAgent);
    const existing = merged.get(agent.id);
    if (!existing) {
      orderedIds.push(agent.id);
      merged.set(agent.id, agent);
      continue;
    }
    merged.set(agent.id, pickPreferredAgent(existing, agent));
  }

  return orderedIds
    .map((id) => merged.get(id))
    .filter((agent): agent is T => Boolean(agent));
}

export const list = query({
  args: {
    status: v.optional(v.string()),
    sortBy: v.optional(v.union(
      v.literal("name"),
      v.literal("cost"),
      v.literal("tokens"),
      v.literal("lastSeen")
    )),
    sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (ctx, args) => {
    const rawAgents = await ctx.db.query("agents").order("asc").collect();
    let agents = dedupeAgents(rawAgents);

    // Filter by status
    if (args.status) {
      agents = agents.filter((a) => a.status === args.status);
    }

    // Sort
    const sortBy = args.sortBy ?? "name";
    const sortOrder = args.sortOrder ?? "asc";

    agents.sort((a, b) => {
      let compareValue = 0;

      switch (sortBy) {
        case "cost":
          compareValue = (a.totalCost ?? 0) - (b.totalCost ?? 0);
          break;
        case "tokens":
          compareValue = (a.totalTokens ?? 0) - (b.totalTokens ?? 0);
          break;
        case "lastSeen":
          compareValue = (a.lastSeen ?? 0) - (b.lastSeen ?? 0);
          break;
        case "name":
        default:
          compareValue = a.name.localeCompare(b.name);
          break;
      }

      return sortOrder === "desc" ? -compareValue : compareValue;
    });

    return agents;
  },
});

export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const canonicalId = canonicalAgentId(args.id);
    const direct = await ctx.db
      .query("agents")
      .withIndex("by_agentId", (q) => q.eq("id", canonicalId))
      .first();

    if (direct) {
      return normalizeAgent(direct);
    }

    if (canonicalId === "coordinator") {
      const legacy = await ctx.db
        .query("agents")
        .withIndex("by_agentId", (q) => q.eq("id", "main"))
        .first();
      if (legacy) {
        return normalizeAgent(legacy);
      }
    }

    return null;
  },
});

export const create = mutation({
  args: {
    id: v.optional(v.string()),
    name: v.string(),
    emoji: v.string(),
    role: v.string(),
    model: v.string(),
    status: v.optional(
      v.union(
        v.literal("idle"),
        v.literal("working"),
        v.literal("offline"),
        v.literal("error")
      )
    ),
  },
  handler: async (ctx, args) => {
    const id = args.id ?? crypto.randomUUID();
    await ctx.db.insert("agents", {
      id,
      name: args.name,
      emoji: args.emoji,
      role: args.role,
      model: args.model,
      status: args.status ?? "idle",
      currentTaskId: undefined,
      lastSeen: Date.now(),
      totalCost: 0,
      totalTokens: 0,
      todayCost: 0,
      todayTokens: 0,
      usageSyncedAt: Date.now(),
    });
    return { id };
  },
});

export const updateStatus = mutation({
  args: {
    id: v.string(),
    status: v.union(
      v.literal("idle"),
      v.literal("working"),
      v.literal("offline"),
      v.literal("error")
    ),
    currentTaskId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_agentId", (q) => q.eq("id", args.id))
      .first();

    if (!agent) throw new Error(`Agent ${args.id} not found`);

    const patch: { status: typeof args.status; currentTaskId?: string } = {
      status: args.status,
    };
    if (args.currentTaskId !== undefined) {
      patch.currentTaskId = args.currentTaskId;
    }

    await ctx.db.patch(agent._id, patch);
  },
});

export const updateLastSeen = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_agentId", (q) => q.eq("id", args.id))
      .first();

    if (!agent) throw new Error(`Agent ${args.id} not found`);

    await ctx.db.patch(agent._id, {
      lastSeen: Date.now(),
    });
  },
});

export const updateProfile = mutation({
  args: {
    id: v.string(),
    name: v.optional(v.string()),
    emoji: v.optional(v.string()),
    role: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_agentId", (q) => q.eq("id", args.id))
      .first();

    if (!agent) throw new Error(`Agent ${args.id} not found`);

    await ctx.db.patch(agent._id, {
      name: args.name ?? agent.name,
      emoji: args.emoji ?? agent.emoji,
      role: args.role ?? agent.role,
      model: args.model ?? agent.model,
    });
  },
});

export const addUsage = mutation({
  args: {
    id: v.string(),
    tokensUsed: v.optional(v.number()),
    costUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_agentId", (q) => q.eq("id", args.id))
      .first();

    if (!agent) throw new Error(`Agent ${args.id} not found`);

    await ctx.db.patch(agent._id, {
      totalTokens: (agent.totalTokens ?? 0) + (args.tokensUsed ?? 0),
      totalCost: (agent.totalCost ?? 0) + (args.costUsd ?? 0),
    });
  },
});

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("agents").first();
    if (existing) return "Agents already seeded";

    const agents = [
      { id: "coordinator", name: "Coordinator", emoji: "C", role: "Plans and routes work", model: "provider/model" },
      { id: "builder", name: "Builder", emoji: "B", role: "Implements scoped changes", model: "provider/model" },
      { id: "reviewer", name: "Reviewer", emoji: "R", role: "Checks quality and policy", model: "provider/model" },
      { id: "observer", name: "Observer", emoji: "O", role: "Tracks health and events", model: "provider/model" },
    ];

    for (const agent of agents) {
      await ctx.db.insert("agents", {
        ...agent,
        status: "idle",
        currentTaskId: undefined,
        lastSeen: Date.now(),
        totalCost: 0,
        totalTokens: 0,
        todayCost: 0,
        todayTokens: 0,
        usageSyncedAt: Date.now(),
      });
    }

    return `Seeded ${agents.length} agents`;
  },
});

export const cleanupDuplicates = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const allAgents = await ctx.db.query("agents").collect();
    const grouped = new Map<string, typeof allAgents>();

    for (const agent of allAgents) {
      const canonicalId = canonicalAgentId(agent.id);
      const existing = grouped.get(canonicalId);
      if (existing) {
        existing.push(agent);
      } else {
        grouped.set(canonicalId, [agent]);
      }
    }

    const duplicateGroups = [...grouped.entries()].filter(([, records]) => records.length > 1);

    if (args.dryRun) {
      return {
        total: allAgents.length,
        duplicateGroups: duplicateGroups.length,
        duplicateRecords: duplicateGroups.reduce((sum, [, records]) => sum + (records.length - 1), 0),
        groups: duplicateGroups.map(([id, records]) => ({
          canonicalId: id,
          count: records.length,
          statuses: records.map((record) => record.status),
        })),
      };
    }

    let deleted = 0;
    let merged = 0;

    for (const [canonicalId, records] of duplicateGroups) {
      const sorted = [...records].sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
      const keep = sorted[0];
      const extras = sorted.slice(1);

      const mergedPayload = {
        id: canonicalId,
        name: keep.name,
        emoji: keep.emoji,
        role: keep.role,
        model: keep.model,
        status: keep.status,
        currentTaskId: keep.currentTaskId,
        lastSeen: Math.max(...records.map((record) => record.lastSeen ?? 0)),
        totalCost: Math.max(...records.map((record) => record.totalCost ?? 0)),
        totalTokens: Math.max(...records.map((record) => record.totalTokens ?? 0)),
      };

      await ctx.db.patch(keep._id, mergedPayload);

      for (const duplicate of extras) {
        await ctx.db.delete(duplicate._id);
        deleted += 1;
      }

      merged += 1;
    }

    return {
      total: allAgents.length,
      groupsMerged: merged,
      recordsDeleted: deleted,
    };
  },
});

/**
 * Sync real usage data from OpenClaw session parsing
 * This overwrites totalCost and totalTokens with REAL values from session files
 */
// Known agent metadata for auto-creation from OpenClaw sessions
const KNOWN_AGENTS: Record<string, { name: string; role: string; emoji: string }> = {
  coordinator: { name: "Coordinator", role: "Plans and routes work", emoji: "C" },
  main: { name: "Coordinator", role: "Plans and routes work", emoji: "C" },
  builder: { name: "Builder", role: "Implements scoped changes", emoji: "B" },
  reviewer: { name: "Reviewer", role: "Checks quality and policy", emoji: "R" },
  observer: { name: "Observer", role: "Tracks health and events", emoji: "O" },
};

export const syncUsage = mutation({
  args: {
    usageData: v.array(
      v.object({
        agentId: v.string(),
        totalCost: v.number(),
        totalTokens: v.number(),
        todayCost: v.optional(v.number()),
        todayTokens: v.optional(v.number()),
        usageSyncedAt: v.optional(v.number()),
        lastActivity: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    let updated = 0;
    let created = 0;

    for (const data of args.usageData) {
      const canonicalId = canonicalAgentId(data.agentId);
      const agent = await ctx.db
        .query("agents")
        .withIndex("by_agentId", (q) => q.eq("id", canonicalId))
        .first();

      if (agent) {
        // Update existing agent with REAL data
        await ctx.db.patch(agent._id, {
          totalCost: data.totalCost,
          totalTokens: data.totalTokens,
          todayCost: data.todayCost ?? 0,
          todayTokens: data.todayTokens ?? 0,
          usageSyncedAt: data.usageSyncedAt ?? Date.now(),
          ...(data.lastActivity ? { lastSeen: data.lastActivity } : {}),
        });
        updated++;
      } else {
        // Create agent if it doesn't exist (discovered from OpenClaw sessions)
        const known = KNOWN_AGENTS[canonicalId] ?? KNOWN_AGENTS[data.agentId];
        await ctx.db.insert("agents", {
          id: canonicalId,
          name: known?.name ?? canonicalId.toUpperCase(),
          emoji: known?.emoji ?? "AG",
          role: known?.role ?? "Agent",
          model: "unknown",
          status: "idle",
          currentTaskId: undefined,
          lastSeen: data.lastActivity ?? Date.now(),
          totalCost: data.totalCost,
          totalTokens: data.totalTokens,
          todayCost: data.todayCost ?? 0,
          todayTokens: data.todayTokens ?? 0,
          usageSyncedAt: data.usageSyncedAt ?? Date.now(),
        });
        created++;
      }
    }

    return { updated, created };
  },
});

/**
 * Sync agent status based on active OpenClaw sessions
 */
export const syncStatus = mutation({
  args: {
    activeAgents: v.array(
      v.object({
        agentId: v.string(),
        activeSessions: v.number(),
        lastActivity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const activeIds = new Set(args.activeAgents.map((a) => canonicalAgentId(a.agentId)));
    const allAgents = await ctx.db.query("agents").collect();

    for (const agent of allAgents) {
      const activeData = args.activeAgents.find(
        (a) => canonicalAgentId(a.agentId) === canonicalAgentId(agent.id)
      );
      
      if (activeData) {
        // Agent has active sessions
        await ctx.db.patch(agent._id, {
          status: "working",
          lastSeen: activeData.lastActivity,
        });
      } else if (agent.status === "working") {
        // Agent was working but no longer has active sessions
        await ctx.db.patch(agent._id, {
          status: "idle",
        });
      }
    }

    return { activeAgents: activeIds.size };
  },
});

/**
 * List all agents with their current task and workload information
 * Used by SwarmDashboard to show real-time agent status
 */
export const listWithCurrentTask = query({
  args: {},
  handler: async (ctx) => {
    const rawAgents = await ctx.db.query("agents").order("asc").collect();
    const agents = dedupeAgents(rawAgents);
    const tasks = await ctx.db.query("tasks").collect();

    return agents.map(agent => {
      // Find current in-progress task
      const currentTask = tasks.find(t =>
        canonicalAgentId(t.assigneeId ?? "") === canonicalAgentId(agent.id) &&
        t.status === "in_progress"
      );

      // Count total assigned tasks (in_progress + assigned + review)
      const workload = tasks.filter(t =>
        canonicalAgentId(t.assigneeId ?? "") === canonicalAgentId(agent.id) &&
        (t.status === "in_progress" || t.status === "assigned" || t.status === "review")
      ).length;

      return {
        ...agent,
        currentTask: currentTask ? {
          id: currentTask.id,
          title: currentTask.title,
          status: currentTask.status,
          priority: currentTask.priority,
          createdAt: currentTask.createdAt,
        } : null,
        workload,
      };
    });
  },
});
