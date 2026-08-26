import { NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { withAuth } from "@/lib/apiAuth";
import { loadWorkflowSpec } from "@/lib/workflows/spec";
import { readWorkflowProgressText } from "@/lib/workflows/progress";

export const runtime = "nodejs";

export const POST = withAuth(async (req) => {
  const body = await req.json().catch(() => ({}));
  const workflowId = typeof body?.workflowId === "string" ? body.workflowId.trim() : "";
  const slotId = typeof body?.slotId === "string" ? body.slotId.trim() : "";
  const agentId = typeof body?.agentId === "string" ? body.agentId.trim() : "";
  if (!workflowId || !slotId || !agentId) {
    return NextResponse.json({ ok: false, error: "workflowId, slotId, agentId are required" }, { status: 400 });
  }
  let extraContext: Record<string, any> | undefined = undefined;
  try {
    const spec = await loadWorkflowSpec(workflowId);
    const progress = await readWorkflowProgressText(spec);
    if (progress && progress.trim()) {
      extraContext = { progress };
    }
  } catch {
    // best-effort: claiming work should not depend on progress.txt.
  }

  const result = await convex.mutation(api.workflows.claimStep, { workflowId, slotId, agentId, extraContext });
  return NextResponse.json(result);
});
