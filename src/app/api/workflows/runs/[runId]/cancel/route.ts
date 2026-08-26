import { NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { withAuth } from "@/lib/apiAuth";
import { cleanupToolPoliciesAfterRun } from "@/lib/openclaw/toolPolicyEnforcement";
import { teardownWorkflowCronsIfIdle } from "@/lib/workflows/cron";

export const runtime = "nodejs";

export const POST = withAuth(async (_req, ctx: { params: Promise<{ runId: string }> }) => {
  const { runId } = await ctx.params;
  const id = typeof runId === "string" ? runId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing runId" }, { status: 400 });
  }

  const detail = await convex.query(api.workflows.getRun, { runId: id });
  if (!detail?.run) {
    return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
  }

  await convex.mutation(api.workflows.setRunStatus, {
    runId: id,
    status: "cancelled",
    message: "Run cancelled by operator",
  });

  // Best-effort cleanup. Cancellation means the run should no longer hold tool policies or background crons.
  try {
    await cleanupToolPoliciesAfterRun({ runId: id });
  } catch {
    // ignore
  }
  try {
    const workflowId = (detail.run as any).workflowId;
    if (typeof workflowId === "string" && workflowId.trim()) {
      await teardownWorkflowCronsIfIdle({ workflowId: workflowId.trim() });
    }
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, runId: id });
});

