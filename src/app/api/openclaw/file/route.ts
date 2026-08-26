import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiAuth";
import { getConfiguredWorkspaceRoot, resolveContainedPath } from "@/lib/security/fileAccess";
import { readBoundedJsonObject } from "@/lib/security/request";

export const runtime = "nodejs";
const MAX_FILE_BYTES = 1024 * 1024;

async function get(request: NextRequest) {
  try {
    const queryPath = request.nextUrl.searchParams.get("path");
    if (!queryPath) return NextResponse.json({ ok: false, error: "path required" }, { status: 400 });
    const resolved = await resolveContainedPath(getConfiguredWorkspaceRoot(), queryPath, { mustExist: true });
    const info = await stat(resolved);
    if (!info.isFile() || info.size > MAX_FILE_BYTES) throw new Error("File is not readable or exceeds 1 MiB");
    const buffer = await readFile(resolved);
    if (request.nextUrl.searchParams.get("raw") === "true") {
      return new Response(buffer, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${path.basename(resolved).replace(/[\"\\]/g, "_")}"`,
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    return NextResponse.json({ ok: true, path: queryPath, content: buffer.toString("utf8") });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Failed to read file" }, { status: 400 });
  }
}

async function put(request: NextRequest) {
  try {
    const body = await readBoundedJsonObject(request, MAX_FILE_BYTES + 4096);
    if (typeof body.path !== "string" || typeof body.content !== "string") throw new Error("path and content required");
    if (Buffer.byteLength(body.content) > MAX_FILE_BYTES) return NextResponse.json({ ok: false, error: "File exceeds 1 MiB" }, { status: 413 });
    const resolved = await resolveContainedPath(getConfiguredWorkspaceRoot(), body.path, { mustExist: false });
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, body.content, "utf8");
    return NextResponse.json({ ok: true, path: body.path });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Failed to write file" }, { status: 400 });
  }
}

async function post(request: NextRequest) {
  return put(request);
}

async function patch(request: NextRequest) {
  try {
    const body = await readBoundedJsonObject(request, 4096);
    if (typeof body.from !== "string" || typeof body.to !== "string") throw new Error("from and to required");
    const root = getConfiguredWorkspaceRoot();
    const from = await resolveContainedPath(root, body.from, { mustExist: true });
    const to = await resolveContainedPath(root, body.to, { mustExist: false });
    await mkdir(path.dirname(to), { recursive: true });
    await rename(from, to);
    return NextResponse.json({ ok: true, from: body.from, to: body.to });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Failed to rename entry" }, { status: 400 });
  }
}

async function remove(request: NextRequest) {
  try {
    const target = request.nextUrl.searchParams.get("path");
    if (!target || target === ".") throw new Error("Non-root path required");
    const resolved = await resolveContainedPath(getConfiguredWorkspaceRoot(), target, { mustExist: true });
    await rm(resolved, { recursive: false, force: false });
    return NextResponse.json({ ok: true, path: target });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Failed to delete entry" }, { status: 400 });
  }
}

export const GET = withAuth(get);
export const PUT = withAuth(put);
export const POST = withAuth(post);
export const PATCH = withAuth(patch);
export const DELETE = withAuth(remove);
