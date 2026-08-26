import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiAuth";
import { getConfiguredWorkspaceRoot, resolveContainedPath } from "@/lib/security/fileAccess";

export const runtime = "nodejs";

async function handler(request: NextRequest) {
  try {
    const root = getConfiguredWorkspaceRoot();
    const queryPath = request.nextUrl.searchParams.get("path") ?? ".";
    const start = await resolveContainedPath(root, queryPath, { mustExist: true });
    const recursive = request.nextUrl.searchParams.get("recursive") === "true";
    const requested = Number(request.nextUrl.searchParams.get("max") ?? 1000);
    const maxItems = Math.max(1, Math.min(Number.isFinite(requested) ? Math.floor(requested) : 1000, 5000));
    const entries: Array<{ name: string; path: string; type: "dir" | "file" }> = [];
    const queue = [start];

    while (queue.length && entries.length < maxItems) {
      const directory = queue.shift() as string;
      for (const name of await readdir(directory)) {
        if (name.startsWith(".")) continue;
        const absolute = path.join(directory, name);
        const relative = path.relative(await resolveContainedPath(root, ".", { mustExist: true }), absolute);
        let resolved: string;
        try {
          resolved = await resolveContainedPath(root, relative, { mustExist: true });
        } catch {
          continue;
        }
        const info = await lstat(resolved);
        if (info.isSymbolicLink()) continue;
        const type = info.isDirectory() ? "dir" : "file";
        entries.push({ name, path: relative, type });
        if (recursive && type === "dir") queue.push(resolved);
        if (entries.length >= maxItems) break;
      }
      if (!recursive) break;
    }
    return NextResponse.json({ ok: true, path: queryPath, files: entries, truncated: entries.length >= maxItems });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Failed to list files" }, { status: 400 });
  }
}

export const GET = withAuth(handler);
