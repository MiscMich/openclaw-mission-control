import { authenticatedMutation as mutation, authenticatedQuery as query } from "./auth";
import { v } from "convex/values";

export const create = mutation({
  args: {
    agentId: v.string(),
    taskId: v.optional(v.string()),
    commentId: v.optional(v.string()),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const id = crypto.randomUUID();
    await ctx.db.insert("notifications", {
      id,
      agentId: args.agentId,
      taskId: args.taskId,
      commentId: args.commentId,
      content: args.content,
      delivered: false,
      createdAt: Date.now(),
    });
    return { id };
  },
});

export const listUndelivered = query({
  args: { agentId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("notifications")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .filter((q) => q.eq(q.field("delivered"), false))
      .order("desc")
      .take(limit);
  },
});

export const listAllUndelivered = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 200;
    return await ctx.db
      .query("notifications")
      .withIndex("by_delivered", (q) => q.eq("delivered", false))
      .order("desc")
      .take(limit);
  },
});

export const markDelivered = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const notification = await ctx.db
      .query("notifications")
      .withIndex("by_notificationId", (q) => q.eq("id", args.id))
      .first();
    if (!notification) throw new Error(`Notification ${args.id} not found`);
    await ctx.db.patch(notification._id, { delivered: true });
    return { ok: true };
  },
});

export const listByAgent = query({
  args: { agentId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("notifications")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(limit);
  },
});


export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db.query("notifications").order("desc").take(limit);
  },
});

export const listUndeliveredCounts = query({
  args: {},
  handler: async (ctx) => {
    const undelivered = await ctx.db
      .query("notifications")
      .withIndex("by_delivered", (q) => q.eq("delivered", false))
      .collect();

    const counts = new Map<string, number>();
    for (const item of undelivered) {
      counts.set(item.agentId, (counts.get(item.agentId) ?? 0) + 1);
    }

    return Array.from(counts.entries()).map(([agentId, count]) => ({
      agentId,
      count,
    }));
  },
});

export const markAllDelivered = mutation({
  args: { agentId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let notifications;
    if (args.agentId) {
      notifications = await ctx.db
        .query("notifications")
        .withIndex("by_agent", (q) => q.eq("agentId", args.agentId!))
        .filter((q) => q.eq(q.field("delivered"), false))
        .collect();
    } else {
      notifications = await ctx.db
        .query("notifications")
        .withIndex("by_delivered", (q) => q.eq("delivered", false))
        .collect();
    }

    for (const notification of notifications) {
      await ctx.db.patch(notification._id, { delivered: true });
    }

    return { markedCount: notifications.length };
  },
});

export const deleteOld = mutation({
  args: { olderThanDays: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const days = args.olderThanDays ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const oldNotifications = await ctx.db
      .query("notifications")
      .filter((q) => q.lt(q.field("createdAt"), cutoff))
      .collect();

    for (const notification of oldNotifications) {
      await ctx.db.delete(notification._id);
    }

    return { deletedCount: oldNotifications.length };
  },
});
