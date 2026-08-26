import { NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";

export async function GET() {
  const items = await convex.query(api.activity.listRecent, { limit: 50 });
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  const body = await request.json();
  const result = await convex.mutation(api.activity.log, {
    type: body.type,
    message: body.message,
    agentId: body.agent_id || body.agentId,
    taskId: body.task_id || body.taskId,
  });
  return NextResponse.json(result);
}
