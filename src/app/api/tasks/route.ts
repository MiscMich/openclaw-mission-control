import { NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { dispatchOpenClawHeartbeat } from "@/lib/openclaw/heartbeat";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const assigned = searchParams.get("assigned") || undefined;

  const tasks = await convex.query(api.tasks.list, {
    status: status ?? undefined,
    assigneeId: assigned ?? undefined,
  });
  return NextResponse.json(tasks);
}

export async function POST(request: Request) {
  const body = await request.json();
  const assigneeId = body.assigned_agent || body.assigneeId || undefined;
  const result = await convex.mutation(api.tasks.create, {
    title: body.title,
    description: body.description || undefined,
    priority: body.priority || "normal",
    status: body.status || undefined,
    assigneeId,
    createdBy: body.created_by || body.createdBy || "operator",
  });

  const dispatch =
    typeof assigneeId === "string" && assigneeId.trim()
      ? await dispatchOpenClawHeartbeat(
          assigneeId,
          `OpenClaw Mission Control new assignment heartbeat: process task ${result.id} now.`
        )
      : { ok: false };

  return NextResponse.json({
    ...result,
    dispatched: dispatch.ok,
    dispatchError: dispatch.error,
  });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  if (!body.id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  await convex.mutation(api.tasks.update, {
    id: body.id,
    title: body.title,
    description: body.description,
    status: body.status,
    priority: body.priority,
    assigneeId: body.assigned_agent || body.assigneeId,
  });

  return NextResponse.json({ ok: true });
}
