import fs from "node:fs/promises";
import path from "node:path";

import { loadWorkflowSpec } from "./spec";

function workspaceRoot(): string {
  const configured = process.env.OPENCLAW_WORKSPACE_ROOT?.trim();
  if (!configured) {
    throw new Error("OPENCLAW_WORKSPACE_ROOT is not configured");
  }
  if (!path.isAbsolute(configured)) {
    throw new Error("OPENCLAW_WORKSPACE_ROOT must be an absolute path");
  }
  return path.resolve(configured);
}

export function workflowWorkspacesRoot(): string {
  return path.join(workspaceRoot(), "openclaw-mission-control", "workflows");
}

function safeResolveUnder(root: string, ...parts: string[]): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, ...parts);
  const prefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  if (!resolved.startsWith(prefix)) {
    throw new Error(`Refusing to write outside workflow workspace root: ${resolved}`);
  }
  return resolved;
}

export function resolveWorkflowSlotWorkspaceDir(params: { workflowId: string; baseDir: string }): string {
  const baseDir = String(params.baseDir ?? "").trim() || "workspace";
  return safeResolveUnder(workflowWorkspacesRoot(), params.workflowId, baseDir);
}

async function copyFile(source: string, destination: string) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function provisionWorkflowWorkspaces(params: { workflowId: string }): Promise<{
  ok: true;
  workflowId: string;
  slotWorkspaceDirs: Record<string, string>;
}> {
  const spec = await loadWorkflowSpec(params.workflowId);
  const workflowDir = path.join(process.cwd(), "workflows", params.workflowId);

  const slotWorkspaceDirs: Record<string, string> = {};
  for (const agent of spec.agents) {
    const baseDir = String(agent.workspace?.baseDir ?? agent.id).trim() || agent.id;
    const workspaceDir = resolveWorkflowSlotWorkspaceDir({ workflowId: spec.id, baseDir });
    slotWorkspaceDirs[agent.id] = workspaceDir;
    await ensureDir(workspaceDir);

    const files = agent.workspace?.files ?? {};
    for (const [fileName, rel] of Object.entries(files)) {
      const relativePath = String(rel ?? "");
      const source = path.resolve(workflowDir, relativePath);
      if (!(await fileExists(source))) {
        throw new Error(`Missing workflow bootstrap file for slot "${agent.id}": ${relativePath}`);
      }
      const destination = path.join(workspaceDir, fileName);
      await copyFile(source, destination);
    }

    // Ensure progress.txt exists for loop memory, but keep it empty by default.
    const progressPath = path.join(workspaceDir, "progress.txt");
    if (!(await fileExists(progressPath))) {
      await fs.writeFile(progressPath, "", "utf-8");
    }
  }

  return { ok: true, workflowId: spec.id, slotWorkspaceDirs };
}
