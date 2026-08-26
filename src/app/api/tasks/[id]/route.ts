import { NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await convex.query(api.tasks.getById, { id });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(task);
}
