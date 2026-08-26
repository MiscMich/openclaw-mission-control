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
    child.on("error", (error) => resolve({ stdout, stderr: error.message, code: 1 }));
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim();
    const limitRaw = Number(url.searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(200, Math.floor(limitRaw)))
      : 50;

    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }

    let cmd = process.env.OPENCLAW_CLI ?? "openclaw";
    let commandEnv: NodeJS.ProcessEnv = process.env;
    try {
      const context = await resolveOpenClawExecutionContext();
      cmd = context.cli;
      commandEnv = context.env;
    } catch {
      // Use process env fallback.
    }

    const result = await runCommand(
      cmd,
      ["cron", "runs", "--id", id, "--limit", String(limit)],
      commandEnv
    );

    if (result.code !== 0) {
      return NextResponse.json(
        { ok: false, error: result.stderr || "Failed to load cron runs" },
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
    const message = error instanceof Error ? error.message : "Failed to load cron runs";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
