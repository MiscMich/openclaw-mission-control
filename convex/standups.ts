import { authenticatedMutation as mutation, authenticatedQuery as query } from "./auth";
import { v } from "convex/values";

export const create = mutation({
  args: {
    date: v.string(),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    const id = crypto.randomUUID();
    await ctx.db.insert("standups", {
      id,
      date: args.date,
      summary: args.summary,
      createdAt: Date.now(),
    });
    return { id };
  },
});

export const latest = query({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query("standups").order("desc").take(1);
    return items[0] ?? null;
  },
});

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 14; // Default to 2 weeks of standups
    return await ctx.db.query("standups").order("desc").take(limit);
  },
});

export const generateDaily = mutation({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = new Date();
    const dateStr = args.date ?? now.toISOString().slice(0, 10);
    const since = new Date(`${dateStr}T00:00:00.000Z`).getTime();
    const until = since + 24 * 60 * 60 * 1000;

    // IMPORTANT: Avoid table scans. Convex functions have a document read limit.
    // Use selective, indexed queries and small `take()` limits.

    // Updated today (used to compute "completed today").
    // Take a generous ceiling but stay well below the function read limit.
    const updatedToday = await ctx.db
      .query("tasks")
      .withIndex("by_updatedAt", (q) => q.gte("updatedAt", since).lt("updatedAt", until))
      .order("desc")
      .take(8000);

    const completed = updatedToday
      .filter((t) => t.status === "completed" || t.status === "done")
      .slice(0, 8);

    const inProgress = await ctx.db
      .query("tasks")
      .withIndex("by_status_updatedAt", (q) => q.eq("status", "in_progress"))
      .order("desc")
      .take(40);

    const blocked = await ctx.db
      .query("tasks")
      .withIndex("by_status_updatedAt", (q) => q.eq("status", "blocked"))
      .order("desc")
      .take(40);

    const review = await ctx.db
      .query("tasks")
      .withIndex("by_status_updatedAt", (q) => q.eq("status", "review"))
      .order("desc")
      .take(40);

    const activity = await ctx.db
      .query("activity")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", since).lt("createdAt", until))
      .order("desc")
      .take(2000);

    const decisions = activity
      .map((a) => a.message)
      .filter((msg) => {
        const lower = msg.toLowerCase();
        return (
          lower.includes("decision") ||
          lower.includes("decided") ||
          lower.includes("deprioritized") ||
          lower.includes("approved")
        );
      })
      .slice(0, 6);

    const formatTasks = (items: typeof updatedToday) =>
      items.length === 0
        ? ["• None"]
        : items.slice(0, 8).map((t) => `• ${t.title}`);

    const summary = [
      `DAILY STANDUP — ${dateStr}`,
      "",
      "COMPLETED TODAY",
      ...formatTasks(completed),
      "",
      "IN PROGRESS",
      ...formatTasks(inProgress),
      "",
      "BLOCKED",
      ...formatTasks(blocked),
      "",
      "NEEDS REVIEW",
      ...formatTasks(review),
      "",
      "KEY DECISIONS",
      ...(decisions.length > 0 ? decisions.map((d) => `• ${d}`) : ["• None"]),
    ].join("\n");

    // Keep a single standup per date to avoid duplicate date tabs in the UI.
    const existing = await ctx.db
      .query("standups")
      .withIndex("by_date", (q) => q.eq("date", dateStr))
      .collect();
    for (const doc of existing) {
      await ctx.db.delete(doc._id);
    }

    const id = crypto.randomUUID();
    await ctx.db.insert("standups", {
      id,
      date: dateStr,
      summary,
      createdAt: Date.now(),
    });

    return { id, date: dateStr, summary };
  },
});
