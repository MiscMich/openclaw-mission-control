import { authenticatedMutation as mutation, authenticatedQuery as query } from "./auth";
import { v } from "convex/values";

function nowMs() {
  return Date.now();
}

export const upsertAgentToolSnapshot = mutation({
  args: { agentId: v.string(), tools: v.any(), workspace: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const ts = nowMs();
    const existing = await ctx.db
      .query("openclawAgentToolSnapshots")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();
    if (existing) {
      // Do not overwrite snapshots by default. The point is exact restoration.
      // But we allow filling in missing fields when new snapshot dimensions are introduced.
      const patch: Record<string, any> = {};
      if (existing.workspace === undefined && args.workspace !== undefined) {
        patch.workspace = args.workspace;
      }
      if (Object.keys(patch).length) {
        patch.updatedAt = ts;
        await ctx.db.patch(existing._id, patch);
      }
      return { ok: true, created: false };
    }
    await ctx.db.insert("openclawAgentToolSnapshots", {
      agentId: args.agentId,
      tools: args.tools,
      workspace: args.workspace,
      takenAt: ts,
      updatedAt: ts,
    });
    return { ok: true, created: true };
  },
});

export const getAgentToolSnapshot = query({
  args: { agentId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("openclawAgentToolSnapshots")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();
    return row ? { agentId: row.agentId, tools: row.tools, workspace: (row as any).workspace, takenAt: row.takenAt, updatedAt: row.updatedAt } : null;
  },
});

export const clearAgentToolSnapshot = mutation({
  args: { agentId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("openclawAgentToolSnapshots")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();
    if (row) await ctx.db.delete(row._id);
    return { ok: true };
  },
});

export const createRunAgentBindings = mutation({
  args: {
    runId: v.string(),
    workflowId: v.string(),
    bindings: v.array(v.object({ agentId: v.string(), role: v.string() })),
  },
  handler: async (ctx, args) => {
    const ts = nowMs();
    for (const b of args.bindings) {
      await ctx.db.insert("workflowRunAgentBindings", {
        runId: args.runId,
        workflowId: args.workflowId,
        agentId: b.agentId,
        role: b.role,
        createdAt: ts,
      });
    }
    return { ok: true };
  },
});

export const listRunAgentBindings = query({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("workflowRunAgentBindings")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();
    return rows.map((r: any) => ({ runId: r.runId, workflowId: r.workflowId, agentId: r.agentId, role: r.role, createdAt: r.createdAt }));
  },
});

export const deleteRunAgentBindings = mutation({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("workflowRunAgentBindings")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
    return { ok: true, deleted: rows.length };
  },
});

export const pruneAndListRolesForAgent = mutation({
  args: { agentId: v.string() },
  handler: async (ctx, args) => {
    const bindings = await ctx.db
      .query("workflowRunAgentBindings")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .collect();

    const activeRoles: string[] = [];
    for (const b of bindings) {
      const run = await ctx.db
        .query("workflowRuns")
        .withIndex("by_runId", (q: any) => q.eq("id", b.runId))
        .first();
      if (!run || run.status !== "running") {
        // stale binding
        await ctx.db.delete(b._id);
        continue;
      }
      activeRoles.push(String(b.role));
    }
    return { agentId: args.agentId, roles: activeRoles };
  },
});
