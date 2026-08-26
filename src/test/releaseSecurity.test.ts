import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workflowWorkspacesRoot } from "@/lib/workflows/workspaceProvision";
import {
  getDefaultAgentsDir,
  getDefaultWorkspaceRootDir,
  getOpenClawHomeDir,
} from "@/lib/openclaw/paths";

const repositoryRoot = path.resolve(__dirname, "../..");
const convexRoot = path.join(repositoryRoot, "convex");
const runtimeRoots = [path.join(repositoryRoot, "src"), path.join(repositoryRoot, "scripts")];

function runtimeSourceFiles(): string[] {
  const files: string[] = [];
  const visit = (target: string) => {
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      const child = path.join(target, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name) && !entry.name.includes(".test.")) files.push(child);
    }
  };
  runtimeRoots.forEach(visit);
  return files;
}

function convexModules(): string[] {
  return fs.readdirSync(convexRoot)
    .filter((name) => name.endsWith(".ts") && !["auth.ts", "schema.ts"].includes(name))
    .filter((name) => !name.startsWith("_"));
}

describe("public release security gates", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("routes every public Convex query and mutation through authenticated wrappers", () => {
    const violations: string[] = [];
    let publicFunctions = 0;

    for (const moduleName of convexModules()) {
      const source = fs.readFileSync(path.join(convexRoot, moduleName), "utf8");
      const declarations = source.match(/export const \w+\s*=\s*(query|mutation)\s*\(/g) ?? [];
      publicFunctions += declarations.length;
      if (declarations.length > 0 && !source.includes('from "./auth"')) violations.push(moduleName);
      if (source.includes('from "./_generated/server"') && /\b(query|mutation)\b/.test(source.split("\n")[0])) {
        violations.push(`${moduleName}: raw builder import`);
      }
    }

    expect(publicFunctions).toBe(98);
    expect(violations).toEqual([]);
  });

  it("requires an explicitly configured workspace root", () => {
    vi.stubEnv("OPENCLAW_WORKSPACE_ROOT", "");
    expect(() => workflowWorkspacesRoot()).toThrow("OPENCLAW_WORKSPACE_ROOT is not configured");
  });

  it("uses only the explicitly configured root", () => {
    const configured = path.join(os.tmpdir(), "mission-control-workspaces");
    vi.stubEnv("OPENCLAW_WORKSPACE_ROOT", configured);
    expect(workflowWorkspacesRoot()).toBe(path.join(configured, "openclaw-mission-control", "workflows"));
  });

  it("requires explicit absolute OpenClaw filesystem roots", () => {
    vi.stubEnv("OPENCLAW_HOME", "");
    vi.stubEnv("OPENCLAW_WORKSPACE_ROOT", "");
    vi.stubEnv("OPENCLAW_AGENTS_DIR", "");
    expect(() => getOpenClawHomeDir()).toThrow("OPENCLAW_HOME is not configured");
    expect(() => getDefaultWorkspaceRootDir()).toThrow("OPENCLAW_WORKSPACE_ROOT is not configured");
    expect(() => getDefaultAgentsDir()).toThrow("OPENCLAW_AGENTS_DIR is not configured");

    for (const invalid of ["relative/root", "~/openclaw-root", "~"]) {
      vi.stubEnv("OPENCLAW_HOME", invalid);
      vi.stubEnv("OPENCLAW_WORKSPACE_ROOT", invalid);
      vi.stubEnv("OPENCLAW_AGENTS_DIR", invalid);
      expect(() => getOpenClawHomeDir()).toThrow("must be an absolute path");
      expect(() => getDefaultWorkspaceRootDir()).toThrow("must be an absolute path");
      expect(() => getDefaultAgentsDir()).toThrow("must be an absolute path");
    }
  });

  it("contains every retained runtime filesystem access within explicit roots", () => {
    const violations: string[] = [];
    for (const file of runtimeSourceFiles()) {
      const relative = path.relative(repositoryRoot, file);
      const source = fs.readFileSync(file, "utf8");
      if (/\b(?:os\.)?homedir\s*\(/.test(source)) violations.push(`${relative}: home directory lookup`);
      if (/(?:startsWith|===)\s*\(\s*["']~(?:\/)?["']\s*\)/.test(source)) {
        violations.push(`${relative}: tilde expansion`);
      }
      if (/path\.join\([^\n]*["']\.openclaw["']/.test(source)) {
        violations.push(`${relative}: .openclaw path construction`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps chat attachments under the configured workspace root only", () => {
    const source = fs.readFileSync(
      path.join(repositoryRoot, "src/app/api/openclaw/chat/send/route.ts"),
      "utf8"
    );
    expect(source).toContain("getConfiguredWorkspaceRoot");
    expect(source).toContain("resolveContainedPath");
    expect(source).not.toContain("api.settings.get");
    expect(source).not.toContain("getOpenClawHomeDir");
    expect(source).not.toContain("expandHome");
  });
});
