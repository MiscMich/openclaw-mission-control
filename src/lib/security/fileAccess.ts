import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

const DENIED_SEGMENTS = new Set([
  ".git",
  ".ssh",
  ".gnupg",
  ".aws",
  ".kube",
  ".docker",
  ".openclaw",
  "credentials",
  "secrets",
  "tokens",
]);

function isSensitiveSegment(segment: string): boolean {
  const value = segment.toLowerCase();
  return (
    DENIED_SEGMENTS.has(value) ||
    value === ".env" ||
    value.startsWith(".env.") ||
    value === "credentials.json" ||
    value === "secrets.json" ||
    value === "auth.json" ||
    value === "openclaw.json" ||
    value === ".npmrc" ||
    value === ".pypirc" ||
    value === ".netrc" ||
    value === "token.txt" ||
    /(secret|credential|private[-_]?key)/.test(value) ||
    value === "id_rsa" ||
    value === "id_ed25519" ||
    value.endsWith(".pem") ||
    value.endsWith(".key") ||
    value.endsWith(".p12") ||
    value.endsWith(".pfx")
  );
}

function assertContained(root: string, candidate: string): void {
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (candidate !== root && !candidate.startsWith(prefix)) {
    throw new Error("Invalid path: outside configured workspace root");
  }
}

export async function resolveContainedPath(
  configuredRoot: string,
  userPath: string,
  options: { mustExist: boolean }
): Promise<string> {
  if (!configuredRoot.trim()) throw new Error("Workspace root is not configured");
  if (userPath.includes("\0") || userPath.includes("\\") || path.isAbsolute(userPath)) {
    throw new Error("Invalid path");
  }

  const segments = userPath.split("/").filter((segment) => segment && segment !== ".");
  if (segments.some((segment) => segment === "..")) throw new Error("Invalid path traversal");
  if (segments.some(isSensitiveSegment)) throw new Error("Sensitive files are not accessible");

  const root = await realpath(path.resolve(configuredRoot));
  const candidate = path.resolve(root, ...segments);
  assertContained(root, candidate);

  let cursor = root;
  for (let index = 0; index < segments.length; index += 1) {
    cursor = path.join(cursor, segments[index]);
    try {
      const info = await lstat(cursor);
      if (info.isSymbolicLink()) throw new Error("Symbolic links are not allowed");
    } catch (error) {
      if (error instanceof Error && error.message === "Symbolic links are not allowed") throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" && !options.mustExist) break;
      throw error;
    }
  }

  if (options.mustExist) {
    const canonical = await realpath(candidate);
    assertContained(root, canonical);
    if (canonical !== candidate) throw new Error("Symbolic links are not allowed");
  }
  return candidate;
}

export function getConfiguredWorkspaceRoot(): string {
  const root = process.env.OPENCLAW_WORKSPACE_ROOT?.trim();
  if (!root) throw new Error("OPENCLAW_WORKSPACE_ROOT is not configured");
  if (!path.isAbsolute(root)) throw new Error("OPENCLAW_WORKSPACE_ROOT must be an absolute path");
  return path.resolve(root);
}
