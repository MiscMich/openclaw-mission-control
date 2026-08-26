import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { resolveOpenClawExecutionContext } from "@/lib/openclaw/client";

export const runtime = "nodejs";

type ModelsListPayload = {
  models?: Array<{
    key?: unknown;
    name?: unknown;
    missing?: unknown;
    available?: unknown;
  }>;
};

function runCommand(
  command: string,
  args: string[],
  options?: { timeoutMs?: number; env?: NodeJS.ProcessEnv }
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options?.timeoutMs,
      env: options?.env ?? process.env,
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 0 });
    });

    child.on("error", (err) => {
      resolve({ stdout, stderr: err.message, code: 1 });
    });
  });
}

export async function GET() {
  let cli = process.env.OPENCLAW_CLI ?? "openclaw";
  let commandEnv: NodeJS.ProcessEnv = process.env;
  try {
    const context = await resolveOpenClawExecutionContext();
    cli = context.cli;
    commandEnv = context.env;
  } catch {
    // Fall back to process env if settings lookup fails.
  }

  const result = await runCommand(cli, ["models", "list", "--json"], {
    env: commandEnv,
    timeoutMs: 7000,
  });

  if (result.code !== 0) {
    return NextResponse.json(
      {
        ok: false,
        error: result.stderr.trim() || "Failed to list OpenClaw models",
        models: [],
      },
      { status: 502 }
    );
  }

  try {
    const parsed = JSON.parse(result.stdout) as ModelsListPayload;
    const rows = Array.isArray(parsed.models) ? parsed.models : [];
    const byId = new Map<string, { id: string; label: string }>();
    for (const row of rows) {
      const id = typeof row.key === "string" ? row.key.trim() : "";
      if (!id) continue;

      const baseLabel =
        typeof row.name === "string" && row.name.trim()
          ? row.name.trim()
          : id;
      const missing = row.missing === true;
      const label = missing ? `${baseLabel} (missing)` : baseLabel;
      if (!byId.has(id)) {
        byId.set(id, { id, label });
      }
    }

    const models = [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
    return NextResponse.json({
      ok: true,
      models,
      count: models.length,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to parse OpenClaw models output",
        models: [],
      },
      { status: 500 }
    );
  }
}
