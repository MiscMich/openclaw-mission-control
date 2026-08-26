import { NextRequest, NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { withAuth } from "@/lib/apiAuth";
import { dispatchOpenClawHeartbeat } from "@/lib/openclaw/heartbeat";

type MessageAttachment = {
  name: string;
  path: string;
  mimeType?: string;
  size?: number;
};

function extractMentionIds(content: string, explicitMentions?: unknown): string[] {
  const mentioned = new Set<string>();

  if (Array.isArray(explicitMentions)) {
    for (const mention of explicitMentions) {
      if (typeof mention === "string" && mention.trim()) {
        mentioned.add(mention.trim().toLowerCase());
      }
    }
  }

  const mentionRegex = /@([a-z0-9_-]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(content)) !== null) {
    if (match[1]) {
      mentioned.add(match[1].toLowerCase());
    }
  }

  return [...mentioned];
}

function normalizeAttachments(
  rawAttachments: unknown
): { ok: true; attachments: MessageAttachment[] | undefined } | { ok: false; error: string } {
  if (rawAttachments === undefined || rawAttachments === null) {
    return { ok: true, attachments: undefined };
  }

  if (!Array.isArray(rawAttachments)) {
    return { ok: false, error: "Invalid field type: attachments must be an array" };
  }

  const attachments: MessageAttachment[] = [];
  for (let index = 0; index < rawAttachments.length; index += 1) {
    const item = rawAttachments[index];

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: `Invalid field type: attachments[${index}] must be an object` };
    }

    const { name, path, mimeType, size } = item as {
      name?: unknown;
      path?: unknown;
      mimeType?: unknown;
      size?: unknown;
    };

    if (typeof name !== "string" || !name.trim()) {
      return {
        ok: false,
        error: `Invalid field type: attachments[${index}].name must be a non-empty string`,
      };
    }

    if (typeof path !== "string" || !path.trim()) {
      return {
        ok: false,
        error: `Invalid field type: attachments[${index}].path must be a non-empty string`,
      };
    }

    if (mimeType !== undefined && mimeType !== null && typeof mimeType !== "string") {
      return {
        ok: false,
        error: `Invalid field type: attachments[${index}].mimeType must be a string`,
      };
    }

    if (size !== undefined && size !== null) {
      if (!Number.isFinite(size) || typeof size !== "number" || size < 0) {
        return {
          ok: false,
          error: `Invalid field type: attachments[${index}].size must be a non-negative number`,
        };
      }
    }

    attachments.push({
      name: name.trim(),
      path: path.trim(),
      ...(typeof mimeType === "string" && mimeType.trim() ? { mimeType: mimeType.trim() } : {}),
      ...(typeof size === "number" ? { size } : {}),
    });
  }

  return { ok: true, attachments: attachments.length > 0 ? attachments : undefined };
}

/**
 * POST /api/messages
 *
 * Endpoint for OpenClaw agents to send messages to each other via the agentToAgent tool.
 * Messages are stored in Convex and trigger notifications for recipients.
 *
 * Request body:
 * {
 *   fromAgentId: string,      // Sender agent ID
 *   toAgentId?: string,       // Recipient agent ID (optional - null for broadcast)
 *   content: string,          // Message content (may be empty when attachments are provided)
 *   mentions?: string[],      // Mentioned agent IDs
 *   attachments?: Array<{     // Optional message attachments
 *     name: string,
 *     path: string,
 *     mimeType?: string,
 *     size?: number
 *   }>,
 *   taskId?: string           // Associated task ID (optional)
 * }
 *
 * Returns:
 * {
 *   ok: true,
 *   messageId: string,
 *   timestamp: number
 * }
 */
async function handler(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      fromAgentId,
      toAgentId,
      content,
      mentions,
      attachments,
      taskId,
      sessionKey,
      channel,
      dispatch,
    } = body as {
      fromAgentId?: unknown;
      toAgentId?: unknown;
      content?: unknown;
      mentions?: unknown;
      attachments?: unknown;
      taskId?: unknown;
      sessionKey?: unknown;
      channel?: unknown;
      dispatch?: unknown;
    };

    // Validate required fields
    if (!fromAgentId || typeof fromAgentId !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid required field: fromAgentId" },
        { status: 400 }
      );
    }

    if (typeof content !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid required field: content" },
        { status: 400 }
      );
    }

    // Validate optional fields if provided
    if (toAgentId !== undefined && toAgentId !== null && typeof toAgentId !== "string") {
      return NextResponse.json(
        { error: "Invalid field type: toAgentId must be string or null" },
        { status: 400 }
      );
    }

    if (mentions !== undefined && !Array.isArray(mentions)) {
      return NextResponse.json(
        { error: "Invalid field type: mentions must be an array" },
        { status: 400 }
      );
    }

    if (taskId !== undefined && typeof taskId !== "string") {
      return NextResponse.json(
        { error: "Invalid field type: taskId must be a string" },
        { status: 400 }
      );
    }

    if (sessionKey !== undefined && sessionKey !== null && typeof sessionKey !== "string") {
      return NextResponse.json(
        { error: "Invalid field type: sessionKey must be a string" },
        { status: 400 }
      );
    }

    if (channel !== undefined && channel !== null && typeof channel !== "string") {
      return NextResponse.json(
        { error: "Invalid field type: channel must be a string" },
        { status: 400 }
      );
    }

    if (dispatch !== undefined && dispatch !== null && typeof dispatch !== "boolean") {
      return NextResponse.json(
        { error: "Invalid field type: dispatch must be a boolean" },
        { status: 400 }
      );
    }

    const normalizedAttachments = normalizeAttachments(attachments);
    if (!normalizedAttachments.ok) {
      return NextResponse.json({ error: normalizedAttachments.error }, { status: 400 });
    }
    const normalizedContent = content.trim();
    if (!normalizedContent && !normalizedAttachments.attachments?.length) {
      return NextResponse.json(
        { error: "Either message content or at least one attachment is required" },
        { status: 400 }
      );
    }

    // Send message via Convex mutation
    // This will:
    // - Store message in agentMessages table
    // - Create notifications for mentioned agents and recipient
    // - Log activity entry
    const normalizedMentions = extractMentionIds(content, mentions);

    const result = await convex.mutation(api.agentMessages.send, {
      fromAgentId,
      toAgentId: toAgentId || undefined,
      content: normalizedContent,
      mentions: normalizedMentions,
      attachments: normalizedAttachments.attachments,
      taskId,
      sessionKey: typeof sessionKey === "string" && sessionKey.trim() ? sessionKey.trim() : undefined,
      channel: typeof channel === "string" && channel.trim() ? channel.trim() : undefined,
    });

    const recipients = new Set<string>();
    if (typeof toAgentId === "string" && toAgentId.trim()) {
      recipients.add(toAgentId.trim().toLowerCase());
    }
    for (const mention of normalizedMentions) {
      recipients.add(mention);
    }
    recipients.delete(fromAgentId.toLowerCase());

    const dispatchResults = await Promise.all(
      (dispatch === false
        ? []
        : [...recipients].map(async (agentId) => ({
            agentId,
            ...(await dispatchOpenClawHeartbeat(
              agentId,
              `OpenClaw Mission Control message heartbeat: process new message from ${fromAgentId}.`
            )),
          })))
    );

    return NextResponse.json({
      ok: true,
      messageId: result.id,
      timestamp: Date.now(),
      dispatchedTo: dispatchResults.filter((item) => item.ok).map((item) => item.agentId),
      dispatchErrors: dispatchResults
        .filter((item) => !item.ok && item.error)
        .map((item) => ({ agentId: item.agentId, error: item.error })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    console.error("[API /messages] Error:", message);

    return NextResponse.json(
      {
        error: "Failed to send message",
        details: message
      },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handler);
