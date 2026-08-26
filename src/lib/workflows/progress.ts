import fs from "node:fs/promises";
import path from "node:path";

import type { WorkflowSpec } from "./types";
import { resolveWorkflowSlotWorkspaceDir } from "./workspaceProvision";

const MAX_PROGRESS_BYTES = 50_000;

function loopSlotIdFromSpec(spec: WorkflowSpec): string | null {
  const loop = (spec.steps ?? []).find((s: any) => (s?.type ?? "single") === "loop");
  const slotId = loop?.agent;
  return typeof slotId === "string" && slotId.trim() ? slotId.trim() : null;
}

export function resolveProgressPathForWorkflow(spec: WorkflowSpec): string | null {
  const loopSlotId = loopSlotIdFromSpec(spec);
  if (!loopSlotId) return null;
  const agent = (spec.agents ?? []).find((a: any) => a?.id === loopSlotId);
  const baseDir = String(agent?.workspace?.baseDir ?? loopSlotId).trim() || loopSlotId;
  const workspaceDir = resolveWorkflowSlotWorkspaceDir({ workflowId: spec.id, baseDir });
  return path.join(workspaceDir, "progress.txt");
}

export async function readWorkflowProgressText(spec: WorkflowSpec): Promise<string> {
  const progressPath = resolveProgressPathForWorkflow(spec);
  if (!progressPath) return "";
  try {
    const buf = await fs.readFile(progressPath);
    if (buf.length <= MAX_PROGRESS_BYTES) return buf.toString("utf-8");
    const head = buf.subarray(0, MAX_PROGRESS_BYTES).toString("utf-8");
    return `${head}\n\n[truncated: progress.txt exceeded ${MAX_PROGRESS_BYTES} bytes]\n`;
  } catch {
    return "(no progress yet)";
  }
}

export async function archiveWorkflowProgress(params: { spec: WorkflowSpec; runId: string }): Promise<void> {
  const progressPath = resolveProgressPathForWorkflow(params.spec);
  if (!progressPath) return;
  let content: string;
  try {
    content = await fs.readFile(progressPath, "utf-8");
  } catch {
    return;
  }
  if (!content.trim()) return;

  const workspaceDir = path.dirname(progressPath);
  const archiveDir = path.join(workspaceDir, "archive", params.runId);
  await fs.mkdir(archiveDir, { recursive: true });
  await fs.writeFile(path.join(archiveDir, "progress.txt"), content, "utf-8");
  await fs.writeFile(progressPath, "", "utf-8");
}

