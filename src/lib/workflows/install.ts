import fs from "node:fs/promises";
import path from "node:path";

import { convex, api } from "@/lib/convexServer";
import { loadWorkflowSpec } from "@/lib/workflows/spec";
import { provisionWorkflowWorkspaces } from "@/lib/workflows/workspaceProvision";
import { computeEffectiveToolsForRoles } from "@/lib/openclaw/toolPolicies";
import { getDefaultAgentsDir } from "@/lib/openclaw/paths";
import {
  readOpenClawConfigJsonFromHomeOrEmpty,
  writeOpenClawConfigJsonToHome,
} from "@/lib/openclaw/openclawConfigFile";
import { workflowDedicatedAgentId } from "@/lib/workflows/agentIds";

function ensureAgentList(config: any): any[] {
  if (!config || typeof config !== "object") throw new Error("OpenClaw config is not an object");
  if (!config.agents || typeof config.agents !== "object") config.agents = {};
  if (!Array.isArray(config.agents.list)) config.agents.list = [];
  return config.agents.list;
}

function roleForSlotFromSpec(spec: any, slotId: string): string {
  const agent = (spec?.agents ?? []).find((a: any) => a?.id === slotId);
  return String(agent?.role ?? "").trim() || "coding";
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function installWorkflowAgents(params: {
  workflowId: string;
}): Promise<{
  ok: true;
  workflowId: string;
  agentIdsBySlot: Record<string, string>;
  backupPath?: string;
}> {
  const spec = await loadWorkflowSpec(params.workflowId);

  // Ensure per-slot workspace exists so the agents are immediately usable.
  const provisioned = await provisionWorkflowWorkspaces({ workflowId: params.workflowId });

  const config = await readOpenClawConfigJsonFromHomeOrEmpty();
  const list = ensureAgentList(config);

  const agentIdsBySlot: Record<string, string> = {};
  const now = new Date().toISOString();

  for (const slot of spec.agents) {
    const agentId = workflowDedicatedAgentId({ workflowId: params.workflowId, slotId: slot.id });
    agentIdsBySlot[slot.id] = agentId;

    const workspaceDir = provisioned.slotWorkspaceDirs[slot.id];
    if (!workspaceDir) throw new Error(`Workspace missing for slot "${slot.id}" (provisioner did not return a dir)`);

    const role = roleForSlotFromSpec(spec, slot.id);
    const tools = computeEffectiveToolsForRoles([role]);

    const agentDir = path.join(getDefaultAgentsDir(), agentId, "agent");
    await ensureDir(agentDir);

    const existing = list.find((a: any) => a && typeof a === "object" && a.id === agentId);
    const payload = {
      id: agentId,
      name: slot.name ?? `${params.workflowId}:${slot.id}`,
      workspace: workspaceDir,
      agentDir,
      tools,
      subagents: { allowAgents: [] },
      meta: { managedBy: "openclaw-mission-control", workflowId: params.workflowId, slotId: slot.id, installedAt: now },
    };
    if (existing) Object.assign(existing, payload);
    else list.push(payload);

    // Also ensure OpenClaw Mission Control's Convex agent record exists so it shows up in UI lists.
    const maybe = await convex.query(api.agents.getById, { id: agentId });
    if (!maybe) {
      await convex.mutation(api.agents.create, {
        id: agentId,
        name: slot.name ?? `${params.workflowId}:${slot.id}`,
        emoji: "WF",
        role: `Workflow: ${params.workflowId} / ${slot.id}`,
        model: "gpt-4.1",
        status: "idle",
      });
    }
  }

  const written = await writeOpenClawConfigJsonToHome(config);

  // Store mapping in Convex so runs are immediately unblocked without manual copy/paste.
  // This is still an explicit operator action (calling this install flow).
  await convex.mutation(api.workflows.upsertRoleMappings, {
    workflowId: params.workflowId,
    mappings: Object.entries(agentIdsBySlot).map(([slotId, agentId]) => ({ slotId, agentId })),
  });

  return { ok: true, workflowId: params.workflowId, agentIdsBySlot, backupPath: written.backupPath };
}
