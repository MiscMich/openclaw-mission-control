import { authenticatedMutation as mutation, authenticatedQuery as query } from "./auth";
import { v } from "convex/values";

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("activity")
      .order("desc")
      .take(limit);
  },
});

export const list = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    agentId: v.optional(v.string()),
    taskId: v.optional(v.string()),
    type: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    const queryBuilder = ctx.db.query("activity").order("desc");

    // Get paginated results
    const result = args.cursor
      ? await queryBuilder.paginate({ numItems: limit, cursor: args.cursor })
      : await queryBuilder.paginate({ numItems: limit, cursor: null });
    let activities = result.page;

    // Apply filters
    if (args.agentId) {
      activities = activities.filter((a) => a.agentId === args.agentId);
    }

    if (args.taskId) {
      activities = activities.filter((a) => a.taskId === args.taskId);
    }

    if (args.type) {
      activities = activities.filter((a) => a.type === args.type);
    }

    if (args.search && args.search.length >= 2) {
      const searchLower = args.search.toLowerCase();
      activities = activities.filter((a) =>
        a.message.toLowerCase().includes(searchLower)
      );
    }

    return {
      activities,
      hasMore: result.continueCursor !== null,
      cursor: result.continueCursor,
      total: activities.length,
    };
  },
});

export const log = mutation({
  args: {
    type: v.string(),
    message: v.string(),
    agentId: v.optional(v.string()),
    taskId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = crypto.randomUUID();
    await ctx.db.insert("activity", {
      id,
      type: args.type,
      message: args.message,
      agentId: args.agentId,
      taskId: args.taskId,
      createdAt: Date.now(),
    });
    return { id };
  },
});
