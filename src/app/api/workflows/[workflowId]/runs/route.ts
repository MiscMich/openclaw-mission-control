import { NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { loadWorkflowSpec } from "@/lib/workflows/spec";
import { ensureWorkflowCrons } from "@/lib/workflows/cron";
import { enforceToolPoliciesForRun } from "@/lib/openclaw/toolPolicyEnforcement";
import { cleanupToolPoliciesAfterRun } from "@/lib/openclaw/toolPolicyEnforcement";
import { provisionWorkflowWorkspaces } from "@/lib/workflows/workspaceProvision";
import { withAuth } from "@/lib/apiAuth";
import { requireLoopbackHttpUrl } from "@/lib/security/url";

export const runtime = "nodejs";

export const GET = withAuth(async (req, ctx: { params: Promise<{ workflowId: string }> }) => {
  const { workflowId } = await ctx.params;
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const runs = await convex.query(api.workflows.listRuns, { workflowId, status });
  return NextResponse.json({ ok: true, workflowId, runs });
});

export const POST = withAuth(async (req, ctx: { params: Promise<{ workflowId: string }> }) => {
  const { workflowId } = await ctx.params;
  const spec = await loadWorkflowSpec(workflowId);
  const body = await req.json().catch(() => ({}));
  const input = typeof body?.input === "string" ? body.input.trim() : "";
  const title = typeof body?.title === "string" ? body.title.trim() : undefined;
  if (!input) {
    return NextResponse.json({ ok: false, error: "Missing input" }, { status: 400 });
  }

  // Mapping is required (blocked until configured).
  const mapping = await convex.query(api.workflows.listRoleMappings, { workflowId });
  const map = new Map(mapping.map((m: any) => [m.slotId, m.agentId]));
  for (const slot of spec.agents) {
    if (!map.get(slot.id)) {
      return NextResponse.json({ ok: false, error: `Missing role mapping for slot "${slot.id}"` }, { status: 400 });
    }
  }

  const steps = spec.steps.map((s, idx) => {
    const slotId = s.agent;
    const agentId = map.get(slotId)!;
    const maxRetries = s.max_retries ?? s.on_fail?.max_retries ?? 2;
    return {
      stepId: s.id,
      stepIndex: idx,
      slotId,
      agentId,
      inputTemplate: s.input,
      expects: s.expects,
      type: (s.type ?? "single") as "single" | "loop",
      loopConfig: s.loop ?? undefined,
      needsHuman: s.needs_human === true,
      retryStepId: s.on_fail?.retry_step,
      maxRetries,
    };
  });

  const created = await convex.mutation(api.workflows.createRun, {
    workflowId,
    workflowVersion: spec.version != null ? String(spec.version) : undefined,
    title,
    input,
    steps,
  });

  // Provision workflow slot workspaces on disk (bootstrap files + progress.txt).
  let workspaceByAgentId: Record<string, string> = {};
  try {
    const provisioned = await provisionWorkflowWorkspaces({ workflowId });
    workspaceByAgentId = Object.fromEntries(
      spec.agents.map((a) => {
        const slotDir = provisioned.slotWorkspaceDirs[a.id];
        const agentId = map.get(a.id)!;
        return [agentId, slotDir];
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await convex.mutation(api.workflows.setRunStatus, {
      runId: created.runId,
      status: "failed",
      message: `Cannot start run: workspace provisioning failed. ${message}`,
    });
    return NextResponse.json({ ok: false, error: `Workspace provisioning failed: ${message}` }, { status: 500 });
  }

  // Enforce tool policies for mapped agents while this run is active (max safety).
  try {
    const mappings = spec.agents.map((a) => ({ slotId: a.id, agentId: map.get(a.id)! }));
    await enforceToolPoliciesForRun({ workflowId, runId: created.runId, mappings, workspaceByAgentId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await convex.mutation(api.workflows.setRunStatus, {
      runId: created.runId,
      status: "failed",
      message: `Cannot start run: tool policy enforcement failed. ${message}`,
    });
    try {
      await cleanupToolPoliciesAfterRun({ runId: created.runId });
    } catch {
      // ignore
    }
    return NextResponse.json({ ok: false, error: `Tool policy enforcement failed: ${message}` }, { status: 500 });
  }

  // Start crons for this workflow (best-effort; fail the run if crons can't be created).
  try {
    const missionControlUrl = requireLoopbackHttpUrl(process.env.MISSION_CONTROL_URL ?? "http://127.0.0.1:3000");
    await ensureWorkflowCrons({ workflowId, missionControlUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await convex.mutation(api.workflows.setRunStatus, {
      runId: created.runId,
      status: "failed",
      message: `Cannot start run: cron setup failed. ${message}`,
    });
    try {
      await cleanupToolPoliciesAfterRun({ runId: created.runId });
    } catch {
      // ignore
    }
    return NextResponse.json({ ok: false, error: `Cron setup failed: ${message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, workflowId, runId: created.runId });
});
