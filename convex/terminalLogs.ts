import { v } from "convex/values";
import { authenticatedMutation as mutation, authenticatedQuery as query } from "./auth";

export const append = mutation({
  args: {
    taskId: v.string(),
    data: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("terminalLogs", {
      id: crypto.randomUUID(),
      taskId: args.taskId,
      data: args.data,
      timestamp: Date.now(),
    });
  },
});

export const list = query({
  args: {
    taskId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 1000;
    const logs = await ctx.db
      .query("terminalLogs")
      .filter((q) => q.eq(q.field("taskId"), args.taskId))
      .order("asc")
      .take(limit);

    return logs;
  },
});

export const clear = mutation({
  args: { taskId: v.string() },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("terminalLogs")
      .filter((q) => q.eq(q.field("taskId"), args.taskId))
      .collect();

    for (const log of logs) {
      await ctx.db.delete(log._id);
    }
  },
});
