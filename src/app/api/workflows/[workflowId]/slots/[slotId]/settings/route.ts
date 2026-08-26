import { NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { withAuth } from "@/lib/apiAuth";
import { loadWorkflowSpec } from "@/lib/workflows/spec";

export const runtime = "nodejs";

export const GET = withAuth(async (_req, ctx: { params: Promise<{ workflowId: string; slotId: string }> }) => {
  const { workflowId, slotId } = await ctx.params;
  const spec = await loadWorkflowSpec(workflowId);
  const slot = spec.agents.find((a) => a.id === slotId);
  if (!slot) {
    return NextResponse.json({ ok: false, error: `Unknown slotId \"${slotId}\" for workflow \"${workflowId}\"` }, { status: 404 });
  }

  const rows = await convex.query(api.workflows.listRoleMappings, { workflowId });
  const mapping = rows.find((r: { slotId: string }) => r.slotId === slotId);
  if (!mapping) {
    return NextResponse.json({ ok: false, error: `No role mapping found for slot \"${slotId}\"` }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    workflowId,
    slotId,
    settings: {
      agentId: mapping.agentId,
      modelPrimary: mapping.modelPrimary ?? null,
      modelFallbacks: Array.isArray(mapping.modelFallbacks) ? mapping.modelFallbacks : [],
    },
  });
});

export const POST = withAuth(async (req, ctx: { params: Promise<{ workflowId: string; slotId: string }> }) => {
  const { workflowId, slotId } = await ctx.params;
  const spec = await loadWorkflowSpec(workflowId);
  const slot = spec.agents.find((a) => a.id === slotId);
  if (!slot) {
    return NextResponse.json({ ok: false, error: `Unknown slotId \"${slotId}\" for workflow \"${workflowId}\"` }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const agentIdRaw = typeof body?.agentId === "string" ? body.agentId.trim() : undefined;
  const modelPrimaryRaw = typeof body?.modelPrimary === "string" ? body.modelPrimary.trim() : undefined;
  const modelFallbacks = Array.isArray(body?.modelFallbacks)
    ? body.modelFallbacks
        .map((m: unknown) => (typeof m === "string" ? m.trim() : ""))
        .filter((m: string) => !!m)
    : undefined;

  try {
    const result = await convex.mutation(api.workflows.setWorkflowSlotSettings, {
      workflowId,
      slotId,
      ...(agentIdRaw !== undefined ? { agentId: agentIdRaw } : {}),
      ...(modelPrimaryRaw !== undefined ? { modelPrimary: modelPrimaryRaw } : {}),
      ...(modelFallbacks !== undefined ? { modelFallbacks } : {}),
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save slot settings";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
});
