import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { resolveOpenClawExecutionContext } from "@/lib/openclaw/client";

export const runtime = "nodejs";

function runCommand(command: string, args: string[], env?: NodeJS.ProcessEnv) {
  return new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
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
  });
}

export async function GET() {
  try {
    let cmd = process.env.OPENCLAW_CLI ?? "openclaw";
    let commandEnv: NodeJS.ProcessEnv = process.env;
    try {
      const context = await resolveOpenClawExecutionContext();
      cmd = context.cli;
      commandEnv = context.env;
    } catch {
      // Use process env fallback.
    }
    const result = await runCommand(cmd, ["cron", "status", "--json"], commandEnv);
    if (result.code !== 0) {
      return NextResponse.json(
        { ok: false, error: result.stderr || "Failed to get cron status" },
        { status: 500 }
      );
    }

    const raw = result.stdout.trim();
    let parsed: unknown = raw;
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      // keep raw
    }
    return NextResponse.json({ ok: true, data: parsed, raw });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get cron status";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
