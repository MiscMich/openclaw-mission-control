import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { withAuth } from "@/lib/apiAuth";
import { OpenClawGatewayError } from "@/lib/openclaw/client";
import { getGatewayWsClient } from "@/lib/openclaw/gatewayWsClient";
import { getConfiguredWorkspaceRoot, resolveContainedPath } from "@/lib/security/fileAccess";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 5_000_000; // Matches OpenClaw parseMessageWithAttachments default.

type IncomingAttachment = {
  name: string;
  path: string;
  mimeType?: string;
  size?: number;
};

type GatewayChatAttachment = {
  type?: string;
  mimeType?: string;
  fileName?: string;
  content?: string;
};


function trimString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeAttachments(raw: unknown): IncomingAttachment[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new OpenClawGatewayError("attachments must be an array", { status: 400 });
  }

  const normalized: IncomingAttachment[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new OpenClawGatewayError(`attachments[${i}] must be an object`, { status: 400 });
    }
    const obj = item as Record<string, unknown>;
    const name = trimString(obj.name);
    const attachmentPath = trimString(obj.path);
    const mimeType = trimString(obj.mimeType) ?? trimString(obj.type);
    const size = typeof obj.size === "number" && Number.isFinite(obj.size) ? obj.size : undefined;

    if (!name) {
      throw new OpenClawGatewayError(`attachments[${i}].name is required`, { status: 400 });
    }
    if (!attachmentPath) {
      throw new OpenClawGatewayError(`attachments[${i}].path is required`, { status: 400 });
    }

    normalized.push({
      name,
      path: attachmentPath,
      ...(mimeType ? { mimeType } : {}),
      ...(typeof size === "number" ? { size } : {}),
    });
  }
  return normalized;
}

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function guessMimeType(att: IncomingAttachment): string | undefined {
  const fromField = trimString(att.mimeType);
  if (fromField) return fromField;
  const ext = path.extname(att.name || att.path).toLowerCase();
  return IMAGE_MIME_BY_EXT[ext];
}

function isImageAttachment(att: IncomingAttachment): boolean {
  const mime = guessMimeType(att);
  if (!mime) return false;
  return mime.startsWith("image/");
}

async function handler(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const sessionKey = trimString(body.sessionKey) ?? "";
    if (!sessionKey) {
      return NextResponse.json({ error: "sessionKey is required" }, { status: 400 });
    }

    const rawMessage = body.message;
    const message =
      typeof rawMessage === "string"
        ? rawMessage
        : rawMessage === undefined || rawMessage === null
          ? ""
          : null;
    if (message === null) {
      return NextResponse.json({ error: "message must be a string" }, { status: 400 });
    }

    const deliver = typeof body.deliver === "boolean" ? body.deliver : undefined;
    const thinking = trimString(body.thinking);
    const timeoutMs =
      typeof body.timeoutMs === "number" && Number.isFinite(body.timeoutMs)
        ? Math.max(0, Math.floor(body.timeoutMs))
        : undefined;
    const idempotencyKey = trimString(body.idempotencyKey) ?? randomUUID();

    const attachments = normalizeAttachments(body.attachments);
    const imageAttachments = attachments.filter((att) => isImageAttachment(att));

    const gatewayAttachments: GatewayChatAttachment[] = [];
    if (imageAttachments.length > 0) {
      const root = getConfiguredWorkspaceRoot();
      for (const att of imageAttachments) {
        const resolved = await resolveContainedPath(root, att.path, { mustExist: true });
        const buffer = await readFile(resolved);
        if (buffer.byteLength > MAX_IMAGE_BYTES) {
          throw new OpenClawGatewayError(
            `Attachment too large: ${att.name} (${buffer.byteLength} > ${MAX_IMAGE_BYTES} bytes)`,
            { status: 400 }
          );
        }
        gatewayAttachments.push({
          type: "file",
          mimeType: guessMimeType(att),
          fileName: att.name,
          content: buffer.toString("base64"),
        });
      }
    }

    if (!message.trim() && gatewayAttachments.length === 0) {
      return NextResponse.json({ error: "message or attachment required" }, { status: 400 });
    }

    const client = getGatewayWsClient();
    await client.ensureConnected();

    const params: Record<string, unknown> = {
      sessionKey,
      message,
      idempotencyKey,
    };
    if (thinking) params.thinking = thinking;
    if (deliver !== undefined) params.deliver = deliver;
    if (timeoutMs !== undefined) params.timeoutMs = timeoutMs;
    if (gatewayAttachments.length > 0) params.attachments = gatewayAttachments;

    const result = await client.request("chat.send", params, { timeoutMs: 10_000 });

    return NextResponse.json({
      ok: true,
      ...(result && typeof result === "object" ? (result as object) : { result }),
      attachmentStats: {
        received: attachments.length,
        imagesSent: gatewayAttachments.length,
        nonImagesIgnored: attachments.length - gatewayAttachments.length,
      },
    });
  } catch (error) {
    if (error instanceof OpenClawGatewayError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status ?? 502 });
    }
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to send OpenClaw chat message",
      },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handler);

