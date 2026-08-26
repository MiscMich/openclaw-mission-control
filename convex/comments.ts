import { authenticatedMutation as mutation, authenticatedQuery as query } from "./auth";
import { v } from "convex/values";
import { api } from "./_generated/api";

const mentionRegex = /@([a-zA-Z0-9_-]+)/g;

function extractMentions(content: string): string[] {
  const mentions: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1].toLowerCase());
  }
  return Array.from(new Set(mentions));
}

export const listByTask = query({
  args: { taskId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("comments")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .collect();
  },
});

export const create = mutation({
  args: {
    taskId: v.string(),
    authorId: v.string(),
    authorName: v.string(),
    content: v.string(),
    mentions: v.optional(v.array(v.string())),
    attachments: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const id = crypto.randomUUID();
    const contentMentions = extractMentions(args.content);
    const mentions = Array.from(
      new Set([...(args.mentions ?? []), ...contentMentions])
    );

    await ctx.db.insert("comments", {
      id,
      taskId: args.taskId,
      authorId: args.authorId,
      authorName: args.authorName,
      content: args.content,
      mentions,
      attachments: args.attachments ?? [],
      createdAt: Date.now(),
    });

    await ctx.db.insert("activity", {
      id: crypto.randomUUID(),
      type: "comment_added",
      message: `${args.authorName} commented`,
      agentId: args.authorId,
      taskId: args.taskId,
      createdAt: Date.now(),
    });

    if (mentions.length > 0) {
      await Promise.all(
        mentions.map((agentId) =>
          ctx.runMutation(api.notifications.create, {
            agentId,
            taskId: args.taskId,
            commentId: id,
            content: `${args.authorName} mentioned you`,
          })
        )
      );

      await Promise.all(
        mentions.map((agentId) =>
          ctx.runMutation(api.taskSubscriptions.add, {
            taskId: args.taskId,
            agentId,
          })
        )
      );
    }

    await ctx.runMutation(api.taskSubscriptions.add, {
      taskId: args.taskId,
      agentId: args.authorId,
    });

    const subscriptions = await ctx.runQuery(api.taskSubscriptions.listByTask, {
      taskId: args.taskId,
    });

    const mentionSet = new Set(mentions);
    const notifyTargets = subscriptions
      .map((sub) => sub.agentId)
      .filter(
        (agentId) =>
          agentId !== args.authorId && !mentionSet.has(agentId)
      );

    if (notifyTargets.length > 0) {
      await Promise.all(
        notifyTargets.map((agentId) =>
          ctx.runMutation(api.notifications.create, {
            agentId,
            taskId: args.taskId,
            commentId: id,
            content: `${args.authorName} commented on a subscribed task`,
          })
        )
      );
    }

    return { id };
  },
});
