import { spawn } from "node:child_process";
import { resolveOpenClawExecutionContext } from "@/lib/openclaw/client";
import { openClawAgentStoreId } from "@/lib/agents/identity";

const DEFAULT_HEARTBEAT_MESSAGE =
  "OpenClaw Mission Control manual heartbeat: process assigned tasks and pending notifications now.";

export function dispatchOpenClawHeartbeat(
  agentId: string,
  message = DEFAULT_HEARTBEAT_MESSAGE
): Promise<{ ok: boolean; error?: string }> {
  return (async () => {
    const openClawAgentId = openClawAgentStoreId(agentId);
    let cli = process.env.OPENCLAW_CLI ?? "openclaw";
    let commandEnv: NodeJS.ProcessEnv = process.env;

    try {
      const context = await resolveOpenClawExecutionContext();
      cli = context.cli;
      commandEnv = context.env;
    } catch {
      // Fall back to process environment.
    }

    try {
      const child = spawn(
        cli,
        ["agent", "--agent", openClawAgentId, "--message", message, "--json"],
        {
          stdio: "ignore",
          detached: true,
          env: commandEnv,
        }
      );
      child.unref();
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to dispatch heartbeat",
      };
    }
  })();
}
