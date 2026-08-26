import { NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { teardownWorkflowCronsIfIdle } from "@/lib/workflows/cron";
import { withAuth } from "@/lib/apiAuth";
import { cleanupToolPoliciesAfterRun } from "@/lib/openclaw/toolPolicyEnforcement";
import { loadWorkflowSpec } from "@/lib/workflows/spec";
import { archiveWorkflowProgress } from "@/lib/workflows/progress";

export const runtime = "nodejs";

export const POST = withAuth(async (req) => {
  const body = await req.json().catch(() => ({}));
  const stepId = typeof body?.stepId === "string" ? body.stepId.trim() : "";
  const agentId = typeof body?.agentId === "string" ? body.agentId.trim() : "";
  const attemptId = typeof body?.attemptId === "string" ? body.attemptId.trim() : "";
  const output = typeof body?.output === "string" ? body.output : "";
  if (!stepId || !agentId) {
    return NextResponse.json({ ok: false, error: "stepId and agentId are required" }, { status: 400 });
  }

  const result = await convex.mutation(api.workflows.completeStep, { stepId, agentId, attemptId: attemptId || undefined, output });

  // Best-effort cron teardown if this completion ended the last active run.
  const runCompleted = (result as any)?.runCompleted === true;
  const runFailed = (result as any)?.runFailed === true;
  if (runCompleted || runFailed) {
    try {
      const runId = (result as any)?.runId;
      if (typeof runId === "string" && runId.trim()) {
        if (runCompleted) {
          try {
            const workflowId = (result as any)?.workflowId;
            if (typeof workflowId === "string" && workflowId.trim()) {
              const spec = await loadWorkflowSpec(workflowId.trim());
              await archiveWorkflowProgress({ spec, runId: runId.trim() });
            }
          } catch {
            // best-effort
          }
        }
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
