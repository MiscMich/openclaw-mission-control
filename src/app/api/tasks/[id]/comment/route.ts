import { NextRequest, NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { withAuth } from "@/lib/apiAuth";

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body.authorId) {
      return NextResponse.json(
        { error: "Missing required field: authorId" },
        { status: 400 }
      );
    }

    if (!body.authorName) {
      return NextResponse.json(
        { error: "Missing required field: authorName" },
        { status: 400 }
      );
    }

    if (!body.content) {
      return NextResponse.json(
        { error: "Missing required field: content" },
        { status: 400 }
      );
    }

    const result = await convex.mutation(api.comments.create, {
      taskId: id,
      authorId: body.authorId,
      authorName: body.authorName,
      content: body.content,
      mentions: body.mentions,
      attachments: body.attachments,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withAuth(handler);
