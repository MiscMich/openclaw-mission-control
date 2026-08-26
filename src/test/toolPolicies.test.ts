import { describe, expect, it } from "vitest";
import { computeEffectiveToolsForRoles } from "@/lib/openclaw/toolPolicies";

describe("toolPolicies", () => {
  it("produces a deterministic tools config for a single role", () => {
    const t = computeEffectiveToolsForRoles(["verification"]);
    expect(t.profile).toBe("coding");
    expect(Array.isArray(t.deny)).toBe(true);
    expect(t.deny).toContain("write");
    expect(t.deny).toContain("cron");
  });

  it("merges roles by unioning deny/alsoAllow", () => {
    const t = computeEffectiveToolsForRoles(["testing", "scanning"]);
    expect(t.profile).toBe("coding");
    expect(t.alsoAllow).toEqual(expect.arrayContaining(["web_search", "web_fetch"]));
    expect(t.deny).toEqual(expect.arrayContaining(["cron", "gateway"]));
  });

  it("defaults to coding when roles are unknown/empty", () => {
    const t = computeEffectiveToolsForRoles(["", "unknown-role"]);
    expect(t.profile).toBe("coding");
    expect(t.deny).toEqual(expect.arrayContaining(["cron", "gateway"]));
  });
});

