import { authenticatedMutation as mutation, authenticatedQuery as query } from "./auth";
import { v } from "convex/values";

export const add = mutation({
  args: { taskId: v.string(), agentId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("taskSubscriptions")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .filter((q) => q.eq(q.field("agentId"), args.agentId))
      .first();
    if (existing) return { ok: true };
    await ctx.db.insert("taskSubscriptions", {
      taskId: args.taskId,
      agentId: args.agentId,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

export const listByTask = query({
  args: { taskId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("taskSubscriptions")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
  },
});
