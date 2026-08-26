import { NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { withAuth } from "@/lib/apiAuth";

export const runtime = "nodejs";

export const POST = withAuth(async (req) => {
  const body = await req.json().catch(() => ({}));
  const stepId = typeof body?.stepId === "string" ? body.stepId.trim() : "";
  const reason = typeof body?.reason === "string" ? body.reason : undefined;
  if (!stepId) {
    return NextResponse.json({ ok: false, error: "stepId is required" }, { status: 400 });
  }

  const result = await convex.mutation(api.workflows.forceReleaseLease, { stepId, reason });
  return NextResponse.json(result);
});

