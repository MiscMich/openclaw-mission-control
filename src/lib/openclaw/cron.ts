import { spawn } from "node:child_process";

export type CommandResult = { stdout: string; stderr: string; code: number };

export type CronJob = {
  id?: string;
  name?: string;
  [key: string]: unknown;
};

type CronListPayload = {
  jobs?: CronJob[];
  items?: CronJob[];
  data?: CronJob[];
};

export function runCommand(
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: env ?? process.env,
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 0 }));
    child.on("error", (error) => resolve({ stdout, stderr: error.message, code: 1 }));
  });
}

function normalizeJobs(payload: unknown): CronJob[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as CronJob[];
  if (typeof payload === "object" && payload !== null) {
    const cast = payload as CronListPayload;
    if (Array.isArray(cast.jobs)) return cast.jobs;
    if (Array.isArray(cast.items)) return cast.items;
    if (Array.isArray(cast.data)) return cast.data;
  }
  return [];
}

export async function listCronJobs(
  cli: string,
  includeAll = true,
  env?: NodeJS.ProcessEnv
): Promise<CronJob[]> {
  const args = ["cron", "list", "--json"];
  if (includeAll) args.splice(2, 0, "--all");

  const result = await runCommand(cli, args, env);
  if (result.code !== 0) {
    throw new Error(result.stderr || "Failed to list cron jobs");
  }

  const raw = result.stdout.trim();
  if (!raw) return [];

  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // leave as raw string and normalize to []
  }
  return normalizeJobs(parsed);
}

export async function resolveCronJobId(
  cli: string,
  idOrName: string,
  env?: NodeJS.ProcessEnv
): Promise<string | null> {
  const input = idOrName.trim();
  if (!input) return null;

  const jobs = await listCronJobs(cli, true, env);
  const direct = jobs.find((job) => job.id === input);
  if (direct?.id) return direct.id;

  const byName = jobs.find((job) => job.name === input);
  return byName?.id ?? null;
}
