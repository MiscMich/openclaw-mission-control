import { NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { withAuth } from "@/lib/apiAuth";

export const runtime = "nodejs";

export const GET = withAuth(async (_req, ctx: { params: Promise<{ workflowId: string }> }) => {
  const { workflowId } = await ctx.params;
  const settings = await convex.query(api.workflows.getWorkflowSettings, { workflowId });
  return NextResponse.json({ ok: true, workflowId, settings });
});

export const POST = withAuth(async (req, ctx: { params: Promise<{ workflowId: string }> }) => {
  const { workflowId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const cronEveryMs = typeof body?.cronEveryMs === "number" ? body.cronEveryMs : NaN;
  if (!Number.isFinite(cronEveryMs) || cronEveryMs < 10_000) {
    return NextResponse.json({ ok: false, error: "cronEveryMs must be a number >= 10000" }, { status: 400 });
  }
  await convex.mutation(api.workflows.setWorkflowSettings, { workflowId, cronEveryMs });
  return NextResponse.json({ ok: true });
});

