import { authenticatedMutation as mutation, authenticatedQuery as query } from "./auth";
import { v } from "convex/values";

const attachmentValidator = v.object({
  name: v.string(),
  path: v.string(),
  mimeType: v.optional(v.string()),
  size: v.optional(v.number()),
});

export const send = mutation({
  args: {
    fromAgentId: v.string(),
    toAgentId: v.optional(v.string()), // null = broadcast to all
    content: v.string(),
    mentions: v.optional(v.array(v.string())),
    attachments: v.optional(v.array(attachmentValidator)),
    taskId: v.optional(v.string()),
    sessionKey: v.optional(v.string()),
    channel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = crypto.randomUUID();
    const now = Date.now();

    // Extract mentions from content (e.g., @builder, @verifier)
    const mentionRegex = /@(\w+)/g;
    const extractedMentions: string[] = [];
    let match;
    while ((match = mentionRegex.exec(args.content)) !== null) {
      extractedMentions.push(match[1].toLowerCase());
    }
    const allMentions = [...new Set([...(args.mentions ?? []), ...extractedMentions])];

    await ctx.db.insert("agentMessages", {
      id,
      fromAgentId: args.fromAgentId,
      toAgentId: args.toAgentId,
      content: args.content,
      mentions: allMentions,
      attachments: args.attachments,
      taskId: args.taskId,
      sessionKey: args.sessionKey,
      channel: args.channel,
      createdAt: now,
    });

    // Create notifications for mentioned agents
    for (const mention of allMentions) {
      await ctx.db.insert("notifications", {
        id: crypto.randomUUID(),
        agentId: mention,
        taskId: args.taskId,
        content: `${args.fromAgentId} mentioned you: "${args.content.slice(0, 100)}${args.content.length > 100 ? "..." : ""}"`,
        delivered: false,
        createdAt: now,
      });
    }

    // Also notify direct recipient if specified and different from mentions
    if (args.toAgentId && !allMentions.includes(args.toAgentId)) {
      await ctx.db.insert("notifications", {
        id: crypto.randomUUID(),
        agentId: args.toAgentId,
        taskId: args.taskId,
        content: `Message from ${args.fromAgentId}: "${args.content.slice(0, 100)}${args.content.length > 100 ? "..." : ""}"`,
        delivered: false,
        createdAt: now,
      });
    }

    // Log activity
    await ctx.db.insert("activity", {
      id: crypto.randomUUID(),
      type: "agent_message",
      message: args.toAgentId 
        ? `${args.fromAgentId} → ${args.toAgentId}: ${args.content.slice(0, 60)}${args.content.length > 60 ? "..." : ""}`
        : `${args.fromAgentId} (broadcast): ${args.content.slice(0, 60)}${args.content.length > 60 ? "..." : ""}`,
      agentId: args.fromAgentId,
      taskId: args.taskId,
      createdAt: now,
    });

    return { id };
  },
});

export const ingestExternal = mutation({
  args: {
    id: v.string(),
    fromAgentId: v.string(),
    toAgentId: v.optional(v.string()),
    content: v.string(),
    createdAt: v.number(),
    taskId: v.optional(v.string()),
    sessionKey: v.optional(v.string()),
    channel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agentMessages")
      .withIndex("by_messageId", (q) => q.eq("id", args.id))
      .first();

    if (existing) {
      return { id: args.id, inserted: false };
    }

    const doc: {
      id: string;
      fromAgentId: string;
      content: string;
      createdAt: number;
      toAgentId?: string;
      taskId?: string;
      sessionKey?: string;
      channel?: string;
    } = {
      id: args.id,
      fromAgentId: args.fromAgentId,
      content: args.content,
      createdAt: args.createdAt,
    };

    if (args.toAgentId !== undefined) doc.toAgentId = args.toAgentId;
    if (args.taskId !== undefined) doc.taskId = args.taskId;
    if (args.sessionKey !== undefined) doc.sessionKey = args.sessionKey;
    if (args.channel !== undefined) doc.channel = args.channel;

    await ctx.db.insert("agentMessages", doc);

    return { id: args.id, inserted: true };
  },
});

export const list = query({
  args: {
    limit: v.optional(v.number()),
    agentId: v.optional(v.string()), // filter by participant
    sessionKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    let messages = await ctx.db.query("agentMessages").order("desc").take(limit * 2);

    // Filter by agent if specified (either sender, recipient, or mentioned)
    if (args.agentId) {
      const agentId = args.agentId;
      messages = messages.filter(
        (m) =>
          m.fromAgentId === agentId ||
          m.toAgentId === agentId ||
          (m.mentions && m.mentions.includes(agentId))
      );
    }

    // Optional session scoping (primarily for external conversations like Telegram).
    if (args.sessionKey) {
      messages = messages.filter((m) => m.sessionKey === args.sessionKey);
    }

    return messages.slice(0, limit).reverse(); // Return in chronological order
  },
});

export const listBySessionKey = query({
  args: {
    sessionKey: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 250;

    const messages = await ctx.db
      .query("agentMessages")
      .withIndex("by_sessionKey", (q) => q.eq("sessionKey", args.sessionKey))
      .order("desc")
      .take(limit);

    // Return in chronological order for easy scanning / UI use.
    return messages.reverse();
  },
});

export const listByTask = query({
  args: { taskId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("agentMessages")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .take(limit);
  },
});

export const getThread = query({
  args: {
    agentId1: v.string(),
    agentId2: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const allMessages = await ctx.db.query("agentMessages").order("desc").take(limit * 2);

    // Filter for messages between these two agents
    const thread = allMessages.filter(
      (m) =>
        (m.fromAgentId === args.agentId1 && m.toAgentId === args.agentId2) ||
        (m.fromAgentId === args.agentId2 && m.toAgentId === args.agentId1)
    );

    return thread.slice(0, limit).reverse();
  },
});
