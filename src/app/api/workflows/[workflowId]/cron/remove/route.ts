import { NextResponse } from "next/server";
import { withAuth } from "@/lib/apiAuth";
import { removeCronJobsByPrefix } from "@/lib/openclaw/gatewayTools";

export const runtime = "nodejs";

export const POST = withAuth(async (_req, ctx: { params: Promise<{ workflowId: string }> }) => {
  const { workflowId } = await ctx.params;
  const prefix = `openclaw-mission-control/${workflowId}/`;
  await removeCronJobsByPrefix(prefix);
  return NextResponse.json({ ok: true, workflowId, removedPrefix: prefix });
});
