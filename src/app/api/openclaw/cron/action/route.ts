import { NextResponse } from "next/server";
import { resolveCronJobId, runCommand } from "@/lib/openclaw/cron";
import { resolveOpenClawExecutionContext } from "@/lib/openclaw/client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const id = typeof body?.id === "string" ? body.id : "";
    const action = typeof body?.action === "string" ? body.action : "";
    const force = body?.force === true;

    if (!id || !action) {
      return NextResponse.json({ ok: false, error: "id and action required" }, { status: 400 });
    }

    const normalizedAction = action === "remove" ? "rm" : action;
    if (!["run", "enable", "disable", "rm"].includes(normalizedAction)) {
      return NextResponse.json(
        { ok: false, error: "action must be run, enable, disable, or rm" },
        { status: 400 }
      );
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
    const resolvedId = await resolveCronJobId(cmd, id, commandEnv);
    if (!resolvedId) {
      return NextResponse.json(
        { ok: false, error: `No cron job found for "${id}"` },
        { status: 404 }
      );
    }

    const args = ["cron", normalizedAction, resolvedId];
    if (normalizedAction === "run" && force) args.push("--force");
    if (normalizedAction === "rm") {
      args.push("--json");
    }

    const result = await runCommand(cmd, args, commandEnv);
    if (result.code !== 0) {
      return NextResponse.json(
        { ok: false, error: result.stderr || "Cron action failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, id: resolvedId, output: result.stdout.trim() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron action failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
