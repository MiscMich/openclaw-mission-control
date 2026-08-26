import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

describe("public demo release boundary", () => {
  it("fails every API route closed", async () => {
    const response = proxy(new NextRequest("http://localhost:3000/api/tasks"));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "API endpoints are disabled in demo mode" });
  });

  it("redirects retained live UI routes to the deterministic dashboard", () => {
    const response = proxy(new NextRequest("http://localhost:3000/settings/agents"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("allows the deterministic dashboard root", () => {
    const response = proxy(new NextRequest("http://localhost:3000/"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
