import { NextResponse } from "next/server";
import { listCronJobs } from "@/lib/openclaw/cron";
import { resolveOpenClawExecutionContext } from "@/lib/openclaw/client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const includeAll = url.searchParams.get("all") === "1";
    let cmd = process.env.OPENCLAW_CLI ?? "openclaw";
    let commandEnv: NodeJS.ProcessEnv = process.env;
    try {
      const context = await resolveOpenClawExecutionContext();
      cmd = context.cli;
      commandEnv = context.env;
    } catch {
      // Use process env fallback.
    }
    const jobs = await listCronJobs(cmd, includeAll, commandEnv);

    return NextResponse.json({ ok: true, data: { jobs }, raw: JSON.stringify({ jobs }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list cron jobs";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
