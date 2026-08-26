import { NextResponse } from "next/server";
import { withAuth } from "@/lib/apiAuth";
import { installWorkflowAgents } from "@/lib/workflows/install";

export const runtime = "nodejs";

export const POST = withAuth(async (_req, ctx: { params: Promise<{ workflowId: string }> }) => {
  const { workflowId } = await ctx.params;
  const id = typeof workflowId === "string" ? workflowId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing workflowId" }, { status: 400 });
  }

  try {
    const result = await installWorkflowAgents({ workflowId: id });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
});

