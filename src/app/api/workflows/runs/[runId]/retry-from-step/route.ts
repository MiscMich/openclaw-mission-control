import { NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { withAuth } from "@/lib/apiAuth";
import { loadWorkflowSpec } from "@/lib/workflows/spec";
import { removeCronJobsByPrefix } from "@/lib/openclaw/gatewayTools";
import { ensureWorkflowCrons } from "@/lib/workflows/cron";
import { enforceToolPoliciesForRun, cleanupToolPoliciesAfterRun } from "@/lib/openclaw/toolPolicyEnforcement";
import { provisionWorkflowWorkspaces } from "@/lib/workflows/workspaceProvision";
import { requireLoopbackHttpUrl } from "@/lib/security/url";

export const runtime = "nodejs";

export const POST = withAuth(async (req, ctx: { params: Promise<{ runId: string }> }) => {
  const { runId } = await ctx.params;
  const id = typeof runId === "string" ? runId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing runId" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const retryStepId = typeof body?.retryStepId === "string" ? body.retryStepId.trim() : "";
  const feedback = typeof body?.feedback === "string" ? body.feedback : "";
  const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : "operator_retry";
  if (!retryStepId) {
    return NextResponse.json({ ok: false, error: "retryStepId is required" }, { status: 400 });
  }

  const detail = await convex.query(api.workflows.getRun, { runId: id });
  const run = detail?.run as any;
  if (!run) {
    return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
  }
  if (run.status === "cancelled" || run.status === "completed") {
    return NextResponse.json({ ok: false, error: `Cannot retry run in status "${run.status}"` }, { status: 400 });
  }
  if (run.status === "running") {
    return NextResponse.json({ ok: false, error: "Cannot retry a running run. Pause it first." }, { status: 400 });
  }

  const workflowId = typeof run.workflowId === "string" ? run.workflowId : "";
  if (!workflowId) {
    return NextResponse.json({ ok: false, error: "Run workflowId missing" }, { status: 500 });
  }

  const spec = await loadWorkflowSpec(workflowId);

  // Mapping is required and must be complete.
  const mapping = await convex.query(api.workflows.listRoleMappings, { workflowId });
  const map = new Map(mapping.map((m: any) => [m.slotId, m.agentId]));
  for (const slot of spec.agents) {
    if (!map.get(slot.id)) {
      return NextResponse.json({ ok: false, error: `Missing role mapping for slot "${slot.id}"` }, { status: 400 });
    }
  }

  const mappings = spec.agents.map((a) => ({ slotId: a.id, agentId: map.get(a.id)! }));

  // 1) Reset pipeline + set run back to running.
  await convex.mutation(api.workflows.retryRunFromStep, {
    runId: id,
    retryStepId,
    feedback: feedback || undefined,
    reason,
  });

  // 2) Ensure the run step agent assignments match the current mapping.
  await convex.mutation(api.workflows.applyRoleMappingToRun, {
    runId: id,
    mappings,
  });

  // 3) Re-apply tool policies + workspaces.
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
    return NextResponse.json({ ok: false, error: `Workspace provisioning failed: ${message}` }, { status: 500 });
  }

  try {
    await enforceToolPoliciesForRun({ workflowId, runId: id, mappings, workspaceByAgentId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: `Tool policy enforcement failed: ${message}` }, { status: 500 });
  }

  // 4) Restart crons to ensure mapping/cadence changes are applied.
  try {
    const prefix = `openclaw-mission-control/${workflowId}/`;
    await removeCronJobsByPrefix(prefix);
    const missionControlUrl = requireLoopbackHttpUrl(process.env.MISSION_CONTROL_URL ?? new URL(req.url).origin);
    await ensureWorkflowCrons({ workflowId, missionControlUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await cleanupToolPoliciesAfterRun({ runId: id });
    } catch {
      // ignore
    }
    return NextResponse.json({ ok: false, error: `Cron setup failed: ${message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, runId: id, workflowId, retryStepId });
});
