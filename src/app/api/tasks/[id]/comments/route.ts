import { NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const comments = await convex.query(api.comments.listByTask, { taskId: id });
  return NextResponse.json(comments);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: taskId } = await params;
  const body = await request.json();
  const result = await convex.mutation(api.comments.create, {
    taskId,
    authorId: body.authorId || body.author || "operator",
    authorName: body.authorName || body.author || "Operator",
    content: body.content,
  });

  return NextResponse.json(result);
}
