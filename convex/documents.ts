import { authenticatedMutation as mutation, authenticatedQuery as query } from "./auth";
import { v } from "convex/values";

export const create = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    type: v.string(),
    taskId: v.optional(v.string()),
    sourcePath: v.optional(v.string()),
    sourceKind: v.optional(v.string()),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const id = crypto.randomUUID();
    const now = Date.now();
    await ctx.db.insert("documents", {
      id,
      title: args.title,
      content: args.content,
      type: args.type,
      taskId: args.taskId,
      sourcePath: args.sourcePath,
      sourceKind: args.sourceKind,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("activity", {
      id: crypto.randomUUID(),
      type: "document_created",
      message: `Document created: ${args.title}`,
      taskId: args.taskId,
      agentId: args.createdBy,
      createdAt: now,
    });
    return { id };
  },
});

export const listByTask = query({
  args: { taskId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documents")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .collect();
  },
});

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db.query("documents").order("desc").take(limit);
  },
});

export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documents")
      .withIndex("by_documentId", (q) => q.eq("id", args.id))
      .first();
  },
});

export const update = mutation({
  args: {
    id: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    type: v.optional(v.string()),
    sourcePath: v.optional(v.string()),
    sourceKind: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("documents")
      .withIndex("by_documentId", (q) => q.eq("id", args.id))
      .first();

    if (!doc) throw new Error(`Document ${args.id} not found`);

    await ctx.db.patch(doc._id, {
      title: args.title ?? doc.title,
      content: args.content ?? doc.content,
      type: args.type ?? doc.type,
      sourcePath: args.sourcePath ?? doc.sourcePath,
      sourceKind: args.sourceKind ?? doc.sourceKind,
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});

export const remove = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("documents")
      .withIndex("by_documentId", (q) => q.eq("id", args.id))
      .first();

    if (!doc) throw new Error(`Document ${args.id} not found`);

    await ctx.db.delete(doc._id);
    return { ok: true };
  },
});

export const listByType = query({
  args: { type: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const docs = await ctx.db.query("documents").order("desc").collect();
    return docs.filter((d) => d.type === args.type).slice(0, limit);
  },
});
