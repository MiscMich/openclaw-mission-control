import { NextResponse } from "next/server";
import { resolveCronJobId, runCommand } from "@/lib/openclaw/cron";
import { resolveOpenClawExecutionContext } from "@/lib/openclaw/client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const agentId = typeof body?.agentId === "string" ? body.agentId : "";
    const explicitId = typeof body?.id === "string" ? body.id : "";
    const explicitName = typeof body?.name === "string" ? body.name : "";
    let cmd = process.env.OPENCLAW_CLI ?? "openclaw";
    let commandEnv: NodeJS.ProcessEnv = process.env;
    try {
      const context = await resolveOpenClawExecutionContext();
      cmd = context.cli;
      commandEnv = context.env;
    } catch {
      // Use process env fallback.
    }

    const candidate = explicitId || explicitName || (agentId ? `${agentId}-heartbeat` : "");
    if (!candidate) {
      return NextResponse.json(
        { ok: false, error: "id, name, or agentId is required" },
        { status: 400 }
      );
    }

    const jobId = await resolveCronJobId(cmd, candidate, commandEnv);
    if (!jobId) {
      return NextResponse.json(
        { ok: false, error: `No cron job found for "${candidate}"` },
        { status: 404 }
      );
    }

    const result = await runCommand(cmd, ["cron", "rm", jobId, "--json"], commandEnv);

    if (result.code !== 0) {
      return NextResponse.json(
        { ok: false, error: result.stderr || "Failed to remove cron" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, id: jobId, output: result.stdout.trim() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove cron";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
