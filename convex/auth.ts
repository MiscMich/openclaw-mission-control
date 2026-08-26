import { customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { mutation, query } from "./_generated/server";

/**
 * Public Convex functions must never trust possession of a deployment URL.
 * A configured Convex auth provider must establish an identity before any
 * query or mutation can read or change application state.
 */
async function requireIdentity(ctx: { auth: { getUserIdentity(): Promise<unknown> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }
  return identity;
}

export const authenticatedQuery = customQuery(query, {
  args: {},
  input: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    return { ctx: { identity }, args };
  },
});

export const authenticatedMutation = customMutation(mutation, {
  args: {},
  input: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    return { ctx: { identity }, args };
  },
});
