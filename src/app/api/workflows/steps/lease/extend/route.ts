import { NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { withAuth } from "@/lib/apiAuth";

export const runtime = "nodejs";

export const POST = withAuth(async (req) => {
  const body = await req.json().catch(() => ({}));
  const stepId = typeof body?.stepId === "string" ? body.stepId.trim() : "";
  const agentId = typeof body?.agentId === "string" ? body.agentId.trim() : "";
  const attemptId = typeof body?.attemptId === "string" ? body.attemptId.trim() : "";
  if (!stepId || !agentId) {
    return NextResponse.json({ ok: false, error: "stepId and agentId are required" }, { status: 400 });
  }
  const result = await convex.mutation(api.workflows.extendLease, { stepId, agentId, attemptId: attemptId || undefined });
  return NextResponse.json(result);
});
