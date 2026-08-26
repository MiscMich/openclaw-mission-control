import { convex, api } from "@/lib/convexServer";
import { loadWorkflowSpec } from "@/lib/workflows/spec";
import { computeEffectiveToolsForRoles } from "@/lib/openclaw/toolPolicies";
import {
  readOpenClawConfigJsonFromHome,
  writeOpenClawConfigJsonToHome,
  findAgentInConfig,
} from "@/lib/openclaw/openclawConfigFile";

type SlotMapping = { slotId: string; agentId: string };

function roleForSlotFromSpec(spec: any, slotId: string): string {
  const agent = (spec?.agents ?? []).find((a: any) => a?.id === slotId);
  return String(agent?.role ?? "").trim() || "coding";
}

function normalizeToolsSnapshot(tools: any): any {
  // Store a JSON-serializable snapshot (tools config is typically plain JSON).
  if (tools === undefined) return null;
  if (tools === null) return null;
  if (typeof tools !== "object") return null;
  return tools;
}

function normalizeWorkspaceSnapshot(workspace: any): string | undefined {
  if (typeof workspace !== "string") return undefined;
  const w = workspace.trim();
  return w ? w : undefined;
}

async function ensureSnapshot(agentId: string, currentTools: any, currentWorkspace: any) {
  await convex.mutation(api.workflowToolPolicy.upsertAgentToolSnapshot, {
    agentId,
    tools: normalizeToolsSnapshot(currentTools),
    workspace: normalizeWorkspaceSnapshot(currentWorkspace),
  });
}

function applyEffectiveToolsToConfig(config: any, agentId: string, roles: string[]) {
  const effective = computeEffectiveToolsForRoles(roles);
  const agent = findAgentInConfig(config, agentId);
  if (!agent) {
    throw new Error(`OpenClaw agent "${agentId}" not found in ~/.openclaw/openclaw.json (agents.list).`);
  }
  agent.tools = {
    ...(agent.tools && typeof agent.tools === "object" ? agent.tools : {}),
    ...effective,
  };
}

function applyWorkspaceToConfig(config: any, agentId: string, workspace: string) {
  const agent = findAgentInConfig(config, agentId);
  if (!agent) {
    throw new Error(`OpenClaw agent "${agentId}" not found in ~/.openclaw/openclaw.json (agents.list).`);
  }
  agent.workspace = workspace;
}

function restoreToolsSnapshotToConfig(config: any, agentId: string, snapshotTools: any) {
  const agent = findAgentInConfig(config, agentId);
  if (!agent) {
    throw new Error(`Cannot restore tools: OpenClaw agent "${agentId}" not found.`);
  }
  if (snapshotTools == null) delete (agent as any).tools;
  else agent.tools = snapshotTools;
}

function restoreWorkspaceSnapshotToConfig(config: any, agentId: string, snapshotWorkspace: any) {
  const agent = findAgentInConfig(config, agentId);
  if (!agent) {
    throw new Error(`Cannot restore workspace: OpenClaw agent "${agentId}" not found.`);
  }
  if (typeof snapshotWorkspace !== "string" || !snapshotWorkspace.trim()) {
    delete (agent as any).workspace;
  } else {
    agent.workspace = snapshotWorkspace.trim();
  }
}

export async function enforceToolPoliciesForRun(params: {
  workflowId: string;
  runId: string;
  mappings: SlotMapping[];
  workspaceByAgentId?: Record<string, string>;
}) {
  const spec = await loadWorkflowSpec(params.workflowId);

  // Preflight existing active bindings so we can validate workspace compatibility
  // without blocking parallel runs by default.
  const uniqueAgentsPreflight = [...new Set(params.mappings.map((m) => m.agentId))];
  const hadActiveBindings = new Map<string, boolean>();
  for (const agentId of uniqueAgentsPreflight) {
    const active = await convex.mutation(api.workflowToolPolicy.pruneAndListRolesForAgent, { agentId });
    hadActiveBindings.set(agentId, active.roles.length > 0);
  }

  // Record bindings for this run in Convex (source of truth for "active").
  await convex.mutation(api.workflowToolPolicy.createRunAgentBindings, {
    runId: params.runId,
    workflowId: params.workflowId,
    bindings: params.mappings.map((m) => ({ agentId: m.agentId, role: roleForSlotFromSpec(spec, m.slotId) })),
  });

  // Compute per-agent effective roles across all active bindings, then write tools config.
  const config = await readOpenClawConfigJsonFromHome();
  const uniqueAgents = [...new Set(params.mappings.map((m) => m.agentId))];
  for (const agentId of uniqueAgents) {
    const agent = findAgentInConfig(config, agentId);
    if (!agent) {
      throw new Error(`OpenClaw agent "${agentId}" not found in ~/.openclaw/openclaw.json (agents.list).`);
    }
    await ensureSnapshot(agentId, agent.tools, (agent as any).workspace);
    const res = await convex.mutation(api.workflowToolPolicy.pruneAndListRolesForAgent, { agentId });
    const desiredWorkspace = normalizeWorkspaceSnapshot(params.workspaceByAgentId?.[agentId]);
    const currentWorkspace = normalizeWorkspaceSnapshot((agent as any).workspace);
    const alreadyActive = hadActiveBindings.get(agentId) === true;
    if (alreadyActive && desiredWorkspace && currentWorkspace && desiredWorkspace !== currentWorkspace) {
      throw new Error(
        `OpenClaw agent "${agentId}" is already active in workspace "${currentWorkspace}". ` +
          `This run requested "${desiredWorkspace}". Use the same lane workspace or pick a different person.`
      );
    }
    applyEffectiveToolsToConfig(config, agentId, res.roles);
    if (desiredWorkspace) {
      applyWorkspaceToConfig(config, agentId, desiredWorkspace);
    }
  }

  await writeOpenClawConfigJsonToHome(config);
  return { ok: true };
}

export async function cleanupToolPoliciesAfterRun(params: { runId: string }) {
  const bindings = await convex.query(api.workflowToolPolicy.listRunAgentBindings, { runId: params.runId });
  await convex.mutation(api.workflowToolPolicy.deleteRunAgentBindings, { runId: params.runId });

  const uniqueAgents = [...new Set(bindings.map((b: any) => b.agentId))];
  const config = await readOpenClawConfigJsonFromHome();
  const agentsToClearSnapshots: string[] = [];
  for (const agentId of uniqueAgents) {
    // If still in use by other active runs, keep enforced policy.
    const active = await convex.mutation(api.workflowToolPolicy.pruneAndListRolesForAgent, { agentId });
    if (active.roles.length > 0) {
      applyEffectiveToolsToConfig(config, agentId, active.roles);
      continue;
    }
    const snap = await convex.query(api.workflowToolPolicy.getAgentToolSnapshot, { agentId });
    if (!snap) continue;
    restoreToolsSnapshotToConfig(config, agentId, snap.tools);
    restoreWorkspaceSnapshotToConfig(config, agentId, (snap as any).workspace);
    agentsToClearSnapshots.push(agentId);
  }

  await writeOpenClawConfigJsonToHome(config);
  for (const agentId of agentsToClearSnapshots) {
    await convex.mutation(api.workflowToolPolicy.clearAgentToolSnapshot, { agentId });
  }
  return { ok: true };
}
