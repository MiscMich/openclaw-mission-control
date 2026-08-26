import { NextResponse } from "next/server";
import { listWorkflowIds } from "@/lib/workflows/spec";
import { loadWorkflowSpec } from "@/lib/workflows/spec";

export const runtime = "nodejs";

export async function GET() {
  const ids = await listWorkflowIds();
  const workflows = [];
  for (const id of ids) {
    try {
      const spec = await loadWorkflowSpec(id);
      workflows.push({
        id: spec.id,
        name: spec.name ?? spec.id,
        version: spec.version ?? null,
        description: spec.description ?? null,
        slots: spec.agents.map((a) => ({ id: a.id, role: a.role ?? null, name: a.name ?? a.id })),
        steps: spec.steps.map((s) => ({ id: s.id, slotId: s.agent, type: s.type ?? "single" })),
      });
    } catch (err) {
      workflows.push({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return NextResponse.json({ ok: true, workflows });
}

