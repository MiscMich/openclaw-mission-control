import path from "node:path";

function requireConfiguredRoot(name: "OPENCLAW_HOME" | "OPENCLAW_WORKSPACE_ROOT" | "OPENCLAW_AGENTS_DIR"): string {
  const configured = process.env[name]?.trim();
  if (!configured) throw new Error(`${name} is not configured`);
  if (!path.isAbsolute(configured)) throw new Error(`${name} must be an absolute path`);
  return path.resolve(configured);
}

export function getOpenClawHomeDir(): string {
  return requireConfiguredRoot("OPENCLAW_HOME");
}

export function getDefaultWorkspaceRootDir(): string {
  return requireConfiguredRoot("OPENCLAW_WORKSPACE_ROOT");
}

export function getDefaultAgentsDir(): string {
  return requireConfiguredRoot("OPENCLAW_AGENTS_DIR");
}

