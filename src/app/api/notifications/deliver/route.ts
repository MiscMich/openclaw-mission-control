import { NextRequest, NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { spawn } from "node:child_process";
import { resolveOpenClawExecutionContext } from "@/lib/openclaw/client";
import { openClawAgentStoreId } from "@/lib/agents/identity";
import { withAuth } from "@/lib/apiAuth";

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
    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 0 });
    });
  });
}

async function handler(_request: NextRequest) {
  try {
    const pending = await convex.query(api.notifications.listAllUndelivered, { limit: 200 });
    if (pending.length === 0) {
      return NextResponse.json({ ok: true, delivered: 0 });
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

    let deliveredCount = 0;
    for (const notification of pending) {
      const openClawAgentId = openClawAgentStoreId(notification.agentId);
      const agentSettings = await convex.query(api.agentSettings.get, {
        agentId: notification.agentId,
      });
      const sessionKey =
        (agentSettings?.sessionKey && agentSettings.sessionKey.trim()) ||
        `agent:${openClawAgentId}:main`;

      // Use openclaw agent to send message to the agent's session
      const result = await runCommand(
        cmd,
        [
        "agent",
        "--agent", openClawAgentId,
        "--session-id", sessionKey.split(":").pop() ?? "main",
        "--message", notification.content,
        "--json",
      ],
        commandEnv
      );

      if (result.code === 0) {
        await convex.mutation(api.notifications.markDelivered, { id: notification.id });
        await convex.mutation(api.activity.log, {
          type: "notification_sent",
          message: `Notification sent to ${notification.agentId}`,
          agentId: notification.agentId,
          taskId: notification.taskId ?? undefined,
        });
        deliveredCount += 1;
      }
    }

    return NextResponse.json({ ok: true, delivered: deliveredCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to deliver notifications";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const POST = withAuth(handler);
