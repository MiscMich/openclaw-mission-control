import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiAuth";
import { getConfiguredWorkspaceRoot, resolveContainedPath } from "@/lib/security/fileAccess";
import { readBoundedJsonObject } from "@/lib/security/request";

const MAX_FILE_BYTES = 1024 * 1024;

async function get(request: NextRequest) {
  try {
    const relativePath = request.nextUrl.searchParams.get("path") ?? ".";
    const resolved = await resolveContainedPath(getConfiguredWorkspaceRoot(), relativePath, { mustExist: true });
    const info = await stat(resolved);
    if (info.isDirectory()) {
      const entries = (await readdir(resolved, { withFileTypes: true }))
        .filter((entry) => !entry.name.startsWith("."))
        .slice(0, 1000)
        .map((entry) => ({
          name: entry.name,
          path: path.posix.join(relativePath === "." ? "" : relativePath, entry.name),
          type: entry.isDirectory() ? "dir" : "file",
        }));
      return NextResponse.json({ kind: "directory", path: relativePath, entries });
    }
    if (!info.isFile() || info.size > MAX_FILE_BYTES) throw new Error("File is not readable or exceeds 1 MiB");
    return NextResponse.json({ kind: "file", path: relativePath, content: await readFile(resolved, "utf8") });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read file" }, { status: 400 });
  }
}

async function post(request: NextRequest) {
  try {
    const body = await readBoundedJsonObject(request, MAX_FILE_BYTES + 4096);
    if (typeof body.path !== "string" || typeof body.content !== "string") {
      return NextResponse.json({ error: "path and content are required" }, { status: 400 });
    }
    if (Buffer.byteLength(body.content) > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "File exceeds 1 MiB" }, { status: 413 });
    }
    const resolved = await resolveContainedPath(getConfiguredWorkspaceRoot(), body.path, { mustExist: false });
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, body.content, { encoding: "utf8", flag: "w" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to write file" }, { status: 400 });
  }
}

export const GET = withAuth(get);
export const POST = withAuth(post);
