import { NextResponse } from "next/server";
import { withAuth } from "@/lib/apiAuth";
import { removeCronJobsByPrefix } from "@/lib/openclaw/gatewayTools";
import { ensureWorkflowCrons } from "@/lib/workflows/cron";
import { requireLoopbackHttpUrl } from "@/lib/security/url";

export const runtime = "nodejs";

export const POST = withAuth(async (req, ctx: { params: Promise<{ workflowId: string }> }) => {
  const { workflowId } = await ctx.params;
  const prefix = `openclaw-mission-control/${workflowId}/`;
  await removeCronJobsByPrefix(prefix);

  // Prefer explicit env var, else use the current request origin.
  const missionControlUrl = requireLoopbackHttpUrl(process.env.MISSION_CONTROL_URL ?? new URL(req.url).origin);
  await ensureWorkflowCrons({ workflowId, missionControlUrl });

  return NextResponse.json({ ok: true, workflowId, restarted: true, missionControlUrl });
});
