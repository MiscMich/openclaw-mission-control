import { NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { loadWorkflowSpec } from "@/lib/workflows/spec";
import { withAuth } from "@/lib/apiAuth";

export const runtime = "nodejs";

export const GET = withAuth(async (_req, ctx: { params: Promise<{ workflowId: string }> }) => {
  const { workflowId } = await ctx.params;
  const spec = await loadWorkflowSpec(workflowId);
  const existing = await convex.query(api.workflows.listRoleMappings, { workflowId });
  const map = new Map(
    existing.map((m: { slotId: string; agentId: string; modelPrimary?: string; modelFallbacks?: string[] }) => [
      m.slotId,
      m,
    ])
  );
  return NextResponse.json({
    ok: true,
    workflowId,
    requiredSlots: spec.agents.map((a) => a.id),
    mappings: spec.agents.map((a) => {
      const row = map.get(a.id) as
        | { slotId: string; agentId: string; modelPrimary?: string; modelFallbacks?: string[] }
        | undefined;
      return {
        slotId: a.id,
        agentId: row?.agentId ?? null,
        modelPrimary: row?.modelPrimary ?? null,
        modelFallbacks: Array.isArray(row?.modelFallbacks) ? row!.modelFallbacks : [],
      };
    }),
  });
});

export const POST = withAuth(async (req, ctx: { params: Promise<{ workflowId: string }> }) => {
  const { workflowId } = await ctx.params;
  const spec = await loadWorkflowSpec(workflowId);
  const body = await req.json().catch(() => ({}));
  const mappings = Array.isArray(body?.mappings) ? body.mappings : [];

  const required = new Set(spec.agents.map((a) => a.id));
  const normalized = [];
  for (const m of mappings) {
    const slotId = typeof m?.slotId === "string" ? m.slotId.trim() : "";
    const agentId = typeof m?.agentId === "string" ? m.agentId.trim() : "";
    if (!slotId || !agentId) continue;
    if (!required.has(slotId)) {
      return NextResponse.json({ ok: false, error: `Unknown slotId "${slotId}" for workflow "${workflowId}"` }, { status: 400 });
    }
    const modelPrimary = typeof m?.modelPrimary === "string" ? m.modelPrimary.trim() : undefined;
    const modelFallbacks = Array.isArray(m?.modelFallbacks)
      ? m.modelFallbacks
          .map((x: unknown) => (typeof x === "string" ? x.trim() : ""))
          .filter((x: string) => !!x)
      : undefined;
    normalized.push({
      slotId,
      agentId,
      ...(modelPrimary !== undefined ? { modelPrimary } : {}),
      ...(modelFallbacks !== undefined ? { modelFallbacks } : {}),
    });
  }

  // Must cover all required slots.
  const covered = new Set(normalized.map((m) => m.slotId));
  for (const slot of required) {
    if (!covered.has(slot)) {
      return NextResponse.json({ ok: false, error: `Missing mapping for slot "${slot}"` }, { status: 400 });
    }
  }

  await convex.mutation(api.workflows.upsertRoleMappings, { workflowId, mappings: normalized });
  return NextResponse.json({ ok: true });
});
