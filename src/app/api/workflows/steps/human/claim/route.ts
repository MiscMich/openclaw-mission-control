import { NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { withAuth } from "@/lib/apiAuth";
import { loadWorkflowSpec } from "@/lib/workflows/spec";
import { readWorkflowProgressText } from "@/lib/workflows/progress";

export const runtime = "nodejs";

export const POST = withAuth(async (req) => {
  const body = await req.json().catch(() => ({}));
  const stepId = typeof body?.stepId === "string" ? body.stepId.trim() : "";
  const agentId = typeof body?.agentId === "string" ? body.agentId.trim() : "";
  if (!stepId || !agentId) {
    return NextResponse.json({ ok: false, error: "stepId and agentId are required" }, { status: 400 });
  }
  let extraContext: Record<string, any> | undefined = undefined;
  try {
    const meta = await convex.query(api.workflows.getStepMeta, { stepId });
    if (meta?.workflowId) {
      const spec = await loadWorkflowSpec(meta.workflowId);
      const progress = await readWorkflowProgressText(spec);
      if (progress && progress.trim()) {
        extraContext = { progress };
      }
    }
  } catch {
    // best-effort
  }

  const result = await convex.mutation(api.workflows.claimHumanStep, { stepId, agentId, extraContext });
  return NextResponse.json(result);
});
