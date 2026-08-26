import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import type { WorkflowSpec } from "./types";

const WORKFLOWS_DIR = path.join(process.cwd(), "workflows");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ensureString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid workflow spec: ${name} must be a non-empty string`);
  }
  return value;
}

function ensureArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid workflow spec: ${name} must be an array`);
  }
  return value;
}

function normalizeWorkflowSpec(raw: unknown): WorkflowSpec {
  if (!isRecord(raw)) throw new Error("Invalid workflow spec: must be an object");

  const id = ensureString(raw.id, "id");
  const agents = ensureArray(raw.agents, "agents").map((a, idx) => {
    if (!isRecord(a)) throw new Error(`Invalid workflow spec: agents[${idx}] must be an object`);
    return {
      id: ensureString(a.id, `agents[${idx}].id`),
      name: typeof a.name === "string" ? a.name : undefined,
      description: typeof a.description === "string" ? a.description : undefined,
      role: typeof a.role === "string" ? (a.role as any) : undefined,
      workspace: isRecord(a.workspace) ? (a.workspace as any) : undefined,
    };
  });

  const steps = ensureArray(raw.steps, "steps").map((s, idx) => {
    if (!isRecord(s)) throw new Error(`Invalid workflow spec: steps[${idx}] must be an object`);
    return {
      id: ensureString(s.id, `steps[${idx}].id`),
      agent: ensureString(s.agent, `steps[${idx}].agent`),
      type: typeof s.type === "string" ? (s.type as any) : undefined,
      loop: isRecord(s.loop) ? (s.loop as any) : undefined,
      needs_human: typeof (s as any).needs_human === "boolean" ? ((s as any).needs_human as boolean) : undefined,
      input: ensureString(s.input, `steps[${idx}].input`),
      expects: ensureString(s.expects, `steps[${idx}].expects`),
      max_retries: typeof s.max_retries === "number" ? s.max_retries : undefined,
      on_fail: isRecord(s.on_fail) ? (s.on_fail as any) : undefined,
    };
  });

  return {
    id,
    name: typeof raw.name === "string" ? raw.name : undefined,
    version: typeof raw.version === "number" ? raw.version : undefined,
    description: typeof raw.description === "string" ? raw.description : undefined,
    agents,
    steps,
    context: isRecord(raw.context) ? (raw.context as Record<string, string>) : undefined,
    cron: isRecord(raw.cron) ? (raw.cron as any) : undefined,
  };
}

export async function listWorkflowIds(): Promise<string[]> {
  const entries = await fs.readdir(WORKFLOWS_DIR, { withFileTypes: true }).catch(() => []);
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

export function resolveWorkflowPath(workflowId: string): string {
  return path.join(WORKFLOWS_DIR, workflowId, "workflow.yml");
}

export async function loadWorkflowSpec(workflowId: string): Promise<WorkflowSpec> {
  const filePath = resolveWorkflowPath(workflowId);
  const text = await fs.readFile(filePath, "utf-8");
  const parsed = YAML.parse(text);
  const spec = normalizeWorkflowSpec(parsed);
  if (spec.id !== workflowId) {
    // Keep this strict to avoid confusion about which workflow is installed/selected.
    throw new Error(`Workflow spec id mismatch: dir "${workflowId}" vs spec.id "${spec.id}"`);
  }

  // Validate step agent references.
  const agentIds = new Set(spec.agents.map((a) => a.id));
  for (const step of spec.steps) {
    if (!agentIds.has(step.agent)) {
      throw new Error(`Invalid workflow spec: step "${step.id}" references unknown agent "${step.agent}"`);
    }
  }

  return spec;
}
