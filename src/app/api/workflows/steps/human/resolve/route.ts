import { NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { withAuth } from "@/lib/apiAuth";

export const runtime = "nodejs";

export const POST = withAuth(async (req) => {
  const body = await req.json().catch(() => ({}));
  const stepId = typeof body?.stepId === "string" ? body.stepId.trim() : "";
  const agentId = typeof body?.agentId === "string" ? body.agentId.trim() : "";
  const attemptId = typeof body?.attemptId === "string" ? body.attemptId.trim() : "";
  const decision = typeof body?.decision === "string" ? body.decision.trim() : "";
  const feedback = typeof body?.feedback === "string" ? body.feedback : undefined;
  const retryStepId = typeof body?.retryStepId === "string" ? body.retryStepId.trim() : undefined;
  if (!stepId || !agentId || !attemptId) {
    return NextResponse.json({ ok: false, error: "stepId, agentId, attemptId are required" }, { status: 400 });
  }
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json({ ok: false, error: 'decision must be "approve" or "reject"' }, { status: 400 });
  }

  const result = await convex.mutation(api.workflows.resolveHumanStep, {
    stepId,
    agentId,
    attemptId,
    decision: decision as any,
    feedback,
    retryStepId: retryStepId || undefined,
  });
  return NextResponse.json(result);
});

