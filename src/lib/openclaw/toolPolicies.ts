export type WorkflowRole =
  | "analysis"
  | "coding"
  | "verification"
  | "testing"
  | "scanning"
  | "pr";

export type OpenClawToolsConfig = {
  profile?: string;
  alsoAllow?: string[];
  deny?: string[];
};

// Tools no workflow agent should ever touch (control plane should own these).
const ALWAYS_DENY = [
  "gateway",
  "cron",
  "message",
  "nodes",
  "canvas",
  "sessions_spawn",
  "sessions_send",
];

const ROLE_TOOL_POLICIES: Record<WorkflowRole, OpenClawToolsConfig> = {
  analysis: {
    profile: "coding",
    deny: [
      ...ALWAYS_DENY,
      "write",
      "edit",
      "apply_patch",
      "group:ui",
      "browser",
      "web_search",
      "web_fetch",
    ],
  },
  coding: {
    profile: "coding",
    deny: [
      ...ALWAYS_DENY,
      "group:ui",
      "browser",
    ],
  },
  verification: {
    profile: "coding",
    deny: [
      ...ALWAYS_DENY,
      "write",
      "edit",
      "apply_patch",
      "group:ui",
      "browser",
      "web_search",
      "web_fetch",
    ],
  },
  testing: {
    profile: "coding",
    alsoAllow: ["browser", "web_search", "web_fetch"],
    deny: [
      ...ALWAYS_DENY,
      "write",
      "edit",
      "apply_patch",
    ],
  },
  scanning: {
    profile: "coding",
    alsoAllow: ["web_search", "web_fetch"],
    deny: [
      ...ALWAYS_DENY,
      "write",
      "edit",
      "apply_patch",
      "group:ui",
      "browser",
    ],
  },
  pr: {
    profile: "coding",
    deny: [
      ...ALWAYS_DENY,
      "write",
      "edit",
      "apply_patch",
      "group:ui",
      "browser",
      "web_search",
      "web_fetch",
    ],
  },
};

function uniq(items: string[]): string[] {
  return [...new Set(items.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim()))];
}

export function computeEffectiveToolsForRoles(roles: string[]): OpenClawToolsConfig {
  const normalized: WorkflowRole[] = roles
    .map((r) => String(r).toLowerCase().trim())
    .filter(Boolean)
    .filter((r): r is WorkflowRole => (r as any) in ROLE_TOOL_POLICIES);

  // Default to coding if we can't interpret roles.
  const effectiveRoles: WorkflowRole[] = normalized.length > 0 ? normalized : ["coding"];

  const profiles = effectiveRoles.map((r) => ROLE_TOOL_POLICIES[r].profile).filter(Boolean) as string[];
  const profile = profiles[0] ?? "coding";

  const alsoAllow = uniq(effectiveRoles.flatMap((r) => ROLE_TOOL_POLICIES[r].alsoAllow ?? []));
  const deny = uniq(effectiveRoles.flatMap((r) => ROLE_TOOL_POLICIES[r].deny ?? []));

  return {
    profile,
    ...(alsoAllow.length ? { alsoAllow } : {}),
    ...(deny.length ? { deny } : {}),
  };
}

