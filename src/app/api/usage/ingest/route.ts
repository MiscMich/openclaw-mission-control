import { NextRequest, NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { withAuth } from "@/lib/apiAuth";
import { readBoundedJsonObject, RequestBoundaryError } from "@/lib/security/request";

export const runtime = "nodejs";

const TASK_STATUSES = [
  "open", "inbox", "assigned", "in_progress", "review", "completed", "done", "blocked", "failed", "cancelled",
] as const;
type TaskStatus = (typeof TASK_STATUSES)[number];

async function handler(request: NextRequest) {
  try {
    const body = await readBoundedJsonObject(request, 32 * 1024);
    const taskId = typeof body?.taskId === "string" ? body.taskId : undefined;
    const agentId = typeof body?.agentId === "string" ? body.agentId : undefined;
    const tokensUsed = typeof body.tokensUsed === "number" && Number.isFinite(body.tokensUsed)
      ? body.tokensUsed : undefined;
    const costUsd = typeof body.costUsd === "number" && Number.isFinite(body.costUsd)
      ? body.costUsd : undefined;
    const output = typeof body?.output === "string" ? body.output : undefined;
    const status = typeof body.status === "string" && TASK_STATUSES.includes(body.status as TaskStatus)
      ? (body.status as TaskStatus)
      : undefined;

    if (!taskId || !agentId) {
      return NextResponse.json(
        { ok: false, error: "taskId and agentId are required" },
        { status: 400 }
      );
    }
    if (taskId.length > 128 || agentId.length > 128 || (output?.length ?? 0) > 20_000) {
      return NextResponse.json({ ok: false, error: "Invalid field length" }, { status: 400 });
    }
    if ((tokensUsed !== undefined && (tokensUsed < 0 || tokensUsed > 100_000_000)) ||
        (costUsd !== undefined && (costUsd < 0 || costUsd > 1_000_000))) {
      return NextResponse.json({ ok: false, error: "Invalid usage values" }, { status: 400 });
    }

    if (status) {
      await convex.mutation(api.tasks.updateStatus, {
        id: taskId,
        status,
        output,
      });
    }

    if (tokensUsed !== undefined || costUsd !== undefined || output) {
      await convex.mutation(api.tasks.addUsage, {
        id: taskId,
        status: status || "in_progress",
        tokensUsed,
        costUsd,
        output,
      });
    }

    if (tokensUsed !== undefined || costUsd !== undefined) {
      await convex.mutation(api.agents.addUsage, {
        id: agentId,
        tokensUsed,
        costUsd,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof RequestBoundaryError ? error.status : 500;
    return NextResponse.json({ ok: false, error: status === 500 ? "Failed to ingest usage" : error instanceof Error ? error.message : "Invalid request" }, { status });
  }
}

export const POST = withAuth(handler);
