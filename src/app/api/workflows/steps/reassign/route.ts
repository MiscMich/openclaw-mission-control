import { NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { withAuth } from "@/lib/apiAuth";

export const runtime = "nodejs";

// Note: This only updates run step assignments. Workflow cron turns still target the workflow role mapping.
// For Ralph-loop operation, prefer changing role mappings (workflow slots) and restarting workflow crons.
export const POST = withAuth(async (req) => {
  const body = await req.json().catch(() => ({}));
  const stepId = typeof body?.stepId === "string" ? body.stepId.trim() : "";
  const newAgentId = typeof body?.newAgentId === "string" ? body.newAgentId.trim() : "";
  if (!stepId || !newAgentId) {
    return NextResponse.json({ ok: false, error: "stepId and newAgentId are required" }, { status: 400 });
  }

  const result = await convex.mutation(api.workflows.reassignStep, { stepId, newAgentId });
  return NextResponse.json(result);
});

