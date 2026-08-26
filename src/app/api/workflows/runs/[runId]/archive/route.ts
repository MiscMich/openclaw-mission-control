import { NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { withAuth } from "@/lib/apiAuth";

export const runtime = "nodejs";

export const POST = withAuth(async (_req, ctx: { params: Promise<{ runId: string }> }) => {
  const { runId } = await ctx.params;
  const id = typeof runId === "string" ? runId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing runId" }, { status: 400 });
  }

  try {
    const result = await convex.mutation(api.workflows.archiveRun, { runId: id });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to archive run";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
});
