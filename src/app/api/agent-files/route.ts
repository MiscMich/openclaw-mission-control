import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiAuth";
import { getConfiguredWorkspaceRoot, resolveContainedPath } from "@/lib/security/fileAccess";
import { readBoundedJsonObject } from "@/lib/security/request";

const AGENT_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_MARKDOWN_BYTES = 256 * 1024;

async function readOptional(root: string, relativePath: string): Promise<string> {
  try {
    const resolved = await resolveContainedPath(root, relativePath, { mustExist: true });
    return await readFile(resolved, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

async function get(request: NextRequest) {
  try {
    const agentId = request.nextUrl.searchParams.get("agentId") ?? "";
    if (!AGENT_ID.test(agentId)) return NextResponse.json({ error: "Valid agentId required" }, { status: 400 });
    const root = getConfiguredWorkspaceRoot();
    const [soulMd, agentsMd] = await Promise.all([
      readOptional(root, `${agentId}/SOUL.md`),
      readOptional(root, `${agentId}/AGENTS.md`),
    ]);
    return NextResponse.json({ soulMd, agentsMd });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to read files" }, { status: 400 });
  }
}

async function post(request: NextRequest) {
  try {
    const body = await readBoundedJsonObject(request, MAX_MARKDOWN_BYTES * 2 + 4096);
    const agentId = typeof body.agentId === "string" ? body.agentId : "";
    if (!AGENT_ID.test(agentId)) return NextResponse.json({ error: "Valid agentId required" }, { status: 400 });
    const root = getConfiguredWorkspaceRoot();
    const writes: Promise<void>[] = [];
    for (const [name, content] of [["SOUL.md", body.soulMd], ["AGENTS.md", body.agentsMd]] as const) {
      if (typeof content !== "string") continue;
      if (Buffer.byteLength(content) > MAX_MARKDOWN_BYTES) return NextResponse.json({ error: `${name} is too large` }, { status: 413 });
      const resolved = await resolveContainedPath(root, `${agentId}/${name}`, { mustExist: false });
      await mkdir(path.dirname(resolved), { recursive: true });
      writes.push(writeFile(resolved, content, "utf8"));
    }
    await Promise.all(writes);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to write files" }, { status: 400 });
  }
}

export const GET = withAuth(get);
export const POST = withAuth(post);
