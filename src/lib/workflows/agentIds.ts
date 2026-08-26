import crypto from "node:crypto";

function sanitizeId(input: string): string {
  // OpenClaw agent ids map to filesystem directories in this repo (see getDefaultAgentsDir usage),
  // so keep them conservative.
  const lowered = input.toLowerCase();
  const replaced = lowered.replace(/[^a-z0-9_-]/g, "_").replace(/_+/g, "_");
  return replaced.replace(/^_+/, "").replace(/_+$/, "");
}

export function workflowDedicatedAgentId(params: { workflowId: string; slotId: string }): string {
  const raw = `mc_wf_${params.workflowId}__${params.slotId}`;
  const base = sanitizeId(raw) || "mc_wf_agent";
  const hash = crypto.createHash("sha1").update(raw).digest("hex").slice(0, 8);
  // Keep ids reasonably short to avoid filesystem/path issues.
  if (base.length <= 60) return `${base}_${hash}`;
  return `${base.slice(0, 60)}_${hash}`;
}

