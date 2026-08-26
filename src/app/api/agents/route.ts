import { NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";

export async function GET() {
  const agents = await convex.query(api.agents.list, {});
  return NextResponse.json(agents);
}

export async function POST(request: Request) {
  const body = await request.json();
  const result = await convex.mutation(api.agents.create, {
    id: body.id,
    name: body.name,
    emoji: body.emoji || "AG",
    role: body.role || "Agent",
    model: body.model || "gpt-4.1",
    status: body.status || "idle",
  });
  return NextResponse.json(result);
}
