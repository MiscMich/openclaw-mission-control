import { NextResponse, NextRequest } from "next/server";
import { convex, api } from "@/lib/convexServer";

export const runtime = "nodejs";

export async function GET(
  _: NextRequest, 
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const settings = await convex.query(api.agentSettings.get, { agentId: id });
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load settings";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function PUT(
  request: NextRequest, 
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const payload = {
      agentId: id,
      name: body?.name,
      emoji: body?.emoji,
      role: body?.role,
      model: body?.model,
      skills: body?.skills ?? [],
      systemPrompts: body?.systemPrompts,
      toolPolicy: body?.toolPolicy,
      heartbeatCron: body?.heartbeatCron,
      configPath: body?.configPath,
    };

    const result = await convex.mutation(api.agentSettings.save, payload);
    return NextResponse.json({ ok: true, id: result.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save settings";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
