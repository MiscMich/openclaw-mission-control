import { authenticatedMutation as mutation, authenticatedQuery as query } from "./auth";
import { v } from "convex/values";

export const get = query({
  args: { agentId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentSettings")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();
  },
});

export const save = mutation({
  args: {
    agentId: v.string(),
    name: v.string(),
    emoji: v.string(),
    role: v.string(),
    sessionKey: v.optional(v.string()),
    model: v.object({
      primary: v.string(),
      fallbacks: v.array(v.string()),
    }),
    skills: v.array(v.string()),
    systemPrompts: v.object({
      soul: v.string(),
      agents: v.string(),
      heartbeat: v.string(),
    }),
    toolPolicy: v.optional(v.string()),
    heartbeatCron: v.optional(v.string()),
    configPath: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agentSettings")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();

    const payload = {
      agentId: args.agentId,
      name: args.name,
      emoji: args.emoji,
      role: args.role,
      sessionKey: args.sessionKey,
      model: args.model,
      skills: args.skills,
      systemPrompts: args.systemPrompts,
      toolPolicy: args.toolPolicy,
      heartbeatCron: args.heartbeatCron,
      configPath: args.configPath,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { id: existing._id };
    }

    const id = await ctx.db.insert("agentSettings", payload);
    return { id };
  },
});
