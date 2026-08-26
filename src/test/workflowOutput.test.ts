import { describe, expect, it } from "vitest";
import { normalizeKvOutput, parseStoriesJson, validateExpects } from "../../convex/workflowOutput";

describe("workflowOutput", () => {
  it("normalizes KEY: value lines and ignores STORIES_JSON", () => {
    const out = normalizeKvOutput(
      [
        "STATUS: done",
        "REPO: /tmp/repo",
        "STORIES_JSON: [{\"id\":\"s1\"}]",
        "BRANCH: feat-x",
      ].join("\n")
    );
    expect(out.status).toBe("done");
    expect(out.repo).toBe("/tmp/repo");
    expect(out.branch).toBe("feat-x");
    expect(out.stories_json).toBeUndefined();
  });

  it("validates expects KEY: value via KV parsing", () => {
    const v1 = validateExpects("STATUS: done", "STATUS: done\nFOO: bar\n");
    expect(v1.ok).toBe(true);
    const v2 = validateExpects("STATUS: done", "STATUS: nope\n");
    expect(v2.ok).toBe(false);
  });

  it("validates expects substring when not KEY: value", () => {
    const v1 = validateExpects("hello world", "xxx hello world yyy");
    expect(v1.ok).toBe(true);
    const v2 = validateExpects("hello world", "nope");
    expect(v2.ok).toBe(false);
  });

  it("validates expects regex:", () => {
    const v1 = validateExpects("regex:/STATUS:\\s*done/i", "status: DONE\nSTATUS: done\n");
    expect(v1.ok).toBe(true);
    const v2 = validateExpects("regex:/STATUS:\\s*done/", "STATUS: nope\n");
    expect(v2.ok).toBe(false);
  });

  it("parses STORIES_JSON block (single line)", () => {
    const stories = parseStoriesJson('STATUS: done\nSTORIES_JSON: [{"id":"s1","title":"t","description":"d","acceptance_criteria":["a"]}]\n');
    expect(stories?.length).toBe(1);
    expect(stories?.[0]?.id).toBe("s1");
  });
});

