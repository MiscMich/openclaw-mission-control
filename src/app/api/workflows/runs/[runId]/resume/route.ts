import { NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { withAuth } from "@/lib/apiAuth";
import { loadWorkflowSpec } from "@/lib/workflows/spec";
import { ensureWorkflowCrons } from "@/lib/workflows/cron";
import { enforceToolPoliciesForRun, cleanupToolPoliciesAfterRun } from "@/lib/openclaw/toolPolicyEnforcement";
import { provisionWorkflowWorkspaces } from "@/lib/workflows/workspaceProvision";
import { removeCronJobsByPrefix } from "@/lib/openclaw/gatewayTools";
import { requireLoopbackHttpUrl } from "@/lib/security/url";

export const runtime = "nodejs";

export const POST = withAuth(async (_req, ctx: { params: Promise<{ runId: string }> }) => {
  const { runId } = await ctx.params;
  const id = typeof runId === "string" ? runId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing runId" }, { status: 400 });
  }

  const detail = await convex.query(api.workflows.getRun, { runId: id });
  const run = detail?.run as any;
  if (!run) {
    return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
  }
  if (run.status !== "paused") {
    return NextResponse.json({ ok: false, error: `Run is not paused (status=${run.status})` }, { status: 400 });
  }

  const workflowId = typeof run.workflowId === "string" ? run.workflowId : "";
  if (!workflowId) {
    return NextResponse.json({ ok: false, error: "Run workflowId missing" }, { status: 500 });
  }

  const spec = await loadWorkflowSpec(workflowId);

  // Mapping is required (blocked until configured).
  const mapping = await convex.query(api.workflows.listRoleMappings, { workflowId });
  const map = new Map(mapping.map((m: any) => [m.slotId, m.agentId]));
  for (const slot of spec.agents) {
    if (!map.get(slot.id)) {
      return NextResponse.json({ ok: false, error: `Missing role mapping for slot "${slot.id}"` }, { status: 400 });
    }
  }

  // Re-apply tool policies + crons before resuming.
  // Ensure workflow workspaces exist so agents have the correct bootstrap files and progress.txt.
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
    const mappings = spec.agents.map((a) => ({ slotId: a.id, agentId: map.get(a.id)! }));
    await enforceToolPoliciesForRun({ workflowId, runId: id, mappings, workspaceByAgentId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: `Tool policy enforcement failed: ${message}` }, { status: 500 });
  }

  try {
    const prefix = `openclaw-mission-control/${workflowId}/`;
    await removeCronJobsByPrefix(prefix);
    const missionControlUrl = requireLoopbackHttpUrl(process.env.MISSION_CONTROL_URL ?? "http://127.0.0.1:3000");
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

  await convex.mutation(api.workflows.setRunStatus, {
    runId: id,
    status: "running",
    message: "Run resumed by operator",
  });

  return NextResponse.json({ ok: true, runId: id });
});
