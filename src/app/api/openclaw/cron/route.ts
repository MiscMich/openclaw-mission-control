import { NextResponse } from "next/server";
import { resolveCronJobId, runCommand } from "@/lib/openclaw/cron";
import { resolveOpenClawExecutionContext } from "@/lib/openclaw/client";
import { openClawAgentStoreId } from "@/lib/agents/identity";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const agentId = typeof body?.agentId === "string" ? body.agentId : "";
    const cron = typeof body?.cron === "string" ? body.cron : "";
    const name = typeof body?.name === "string" ? body.name : agentId;
    const role = typeof body?.role === "string" ? body.role : "Agent";
    const message =
      typeof body?.message === "string" && body.message.trim()
        ? body.message
        : `You are ${name}, the ${role}. Check OpenClaw Mission Control for new tasks, mentions, and activity. If nothing to do, reply HEARTBEAT_OK.`;

    if (!agentId || !cron) {
      return NextResponse.json({ ok: false, error: "agentId and cron are required" }, { status: 400 });
    }
    const openClawAgentId = openClawAgentStoreId(agentId);

    let cmd = process.env.OPENCLAW_CLI ?? "openclaw";
    let commandEnv: NodeJS.ProcessEnv = process.env;
    try {
      const context = await resolveOpenClawExecutionContext();
      cmd = context.cli;
      commandEnv = context.env;
    } catch {
      // Use process env fallback.
    }
    const jobName = `${agentId}-heartbeat`;
    const existingId = await resolveCronJobId(cmd, jobName, commandEnv);
    if (existingId) {
      await runCommand(cmd, ["cron", "rm", existingId, "--json"], commandEnv);
    }

    const addResult = await runCommand(
      cmd,
      [
        "cron",
        "add",
        "--name",
        jobName,
        "--agent",
        openClawAgentId,
        "--cron",
        cron,
        "--session",
        "isolated",
        "--message",
        message,
        "--json",
      ],
      commandEnv
    );

    if (addResult.code !== 0) {
      return NextResponse.json(
        { ok: false, error: addResult.stderr || "Failed to update cron" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      output: addResult.stdout.trim(),
      replaced: !!existingId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to apply cron";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
