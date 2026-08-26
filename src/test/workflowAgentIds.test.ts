import { describe, expect, it } from "vitest";
import { workflowDedicatedAgentId } from "@/lib/workflows/agentIds";

describe("workflowDedicatedAgentId", () => {
  it("produces filesystem-safe ids and is deterministic", () => {
    const a = workflowDedicatedAgentId({ workflowId: "feature-dev", slotId: "developer" });
    const b = workflowDedicatedAgentId({ workflowId: "feature-dev", slotId: "developer" });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-z0-9_-]+$/);
    expect(a.length).toBeGreaterThan(10);
  });

  it("sanitizes weird input", () => {
    const id = workflowDedicatedAgentId({ workflowId: "My WF", slotId: "reviewer/operator" });
    expect(id).toMatch(/^[a-z0-9_-]+$/);
  });
});

