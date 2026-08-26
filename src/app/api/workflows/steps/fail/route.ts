import { NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { teardownWorkflowCronsIfIdle } from "@/lib/workflows/cron";
import { withAuth } from "@/lib/apiAuth";
import { cleanupToolPoliciesAfterRun } from "@/lib/openclaw/toolPolicyEnforcement";

export const runtime = "nodejs";

export const POST = withAuth(async (req) => {
  const body = await req.json().catch(() => ({}));
  const stepId = typeof body?.stepId === "string" ? body.stepId.trim() : "";
  const agentId = typeof body?.agentId === "string" ? body.agentId.trim() : "";
  const attemptId = typeof body?.attemptId === "string" ? body.attemptId.trim() : "";
  const error = typeof body?.error === "string" ? body.error.trim() : "Unknown error";
  if (!stepId || !agentId) {
    return NextResponse.json({ ok: false, error: "stepId and agentId are required" }, { status: 400 });
  }
  const result = await convex.mutation(api.workflows.failStep, { stepId, agentId, attemptId: attemptId || undefined, error });
  if (result?.runFailed) {
    try {
      const runId = (result as any)?.runId;
      if (typeof runId === "string" && runId.trim()) {
        await cleanupToolPoliciesAfterRun({ runId: runId.trim() });
      }
      const workflowId = result.workflowId;
      if (workflowId) await teardownWorkflowCronsIfIdle({ workflowId });
    } catch {
      // ignore
    }
  }
  return NextResponse.json(result);
});
