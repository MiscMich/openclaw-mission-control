import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;

function missingConfiguration(): never {
  throw new Error("Convex is not configured; enable live mode and set CONVEX_URL");
}

export const convex = convexUrl
  ? new ConvexHttpClient(convexUrl)
  : ({
      query: async () => missingConfiguration(),
      mutation: async () => missingConfiguration(),
      action: async () => missingConfiguration(),
    } as unknown as ConvexHttpClient);

export { api };
