import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveContainedPath } from "./fileAccess";

describe("workspace file containment", () => {
  let sandbox = "";
  let root = "";
  let outside = "";

  beforeEach(async () => {
    sandbox = await mkdtemp(path.join(os.tmpdir(), "openclaw-mc-files-"));
    root = path.join(sandbox, "workspace");
    outside = path.join(sandbox, "outside");
    await mkdir(path.join(root, "notes"), { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(root, "notes", "status.md"), "safe");
    await writeFile(path.join(outside, "secret.txt"), "private");
  });

  afterEach(async () => {
    if (sandbox) await rm(sandbox, { recursive: true, force: true });
  });

  it("allows ordinary files beneath the configured root", async () => {
    const canonicalRoot = await realpath(root);
    await expect(resolveContainedPath(root, "notes/status.md", { mustExist: true })).resolves.toBe(
      path.join(canonicalRoot, "notes", "status.md")
    );
  });

  it.each(["../outside/secret.txt", "/etc/passwd", "notes/../../outside/secret.txt"])(
    "rejects traversal or absolute path %s",
    async (candidate) => {
      await expect(resolveContainedPath(root, candidate, { mustExist: true })).rejects.toThrow(/path/i);
    }
  );

  it("rejects symlinks even when the lexical path is inside the root", async () => {
    await symlink(path.join(outside, "secret.txt"), path.join(root, "notes", "linked.txt"));
    await expect(resolveContainedPath(root, "notes/linked.txt", { mustExist: true })).rejects.toThrow(/symbolic link/i);
  });

  it.each([".env", ".env.local", "credentials.json", "id_ed25519", ".git/config", "token.txt", ".npmrc", "client-secret.txt", ".openclaw/config.json"])(
    "denies sensitive path %s",
    async (candidate) => {
      await expect(resolveContainedPath(root, candidate, { mustExist: false })).rejects.toThrow(/sensitive/i);
    }
  );
});
