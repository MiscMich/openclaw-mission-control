import { NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const date = typeof body?.date === "string" ? body.date : undefined;
    const result = await convex.mutation(api.standups.generateDaily, { date });
    return NextResponse.json({ ok: true, standup: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate standup";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
