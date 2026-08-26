import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSessionToken,
  isAllowedBrowserOrigin,
  isAuthDisabled,
  secureEqual,
  verifySessionToken,
} from "./auth";

describe("secure authentication primitives", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps operational APIs disabled in the public release", () => {
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    vi.stubEnv("NODE_ENV", "production");
    expect(isAuthDisabled()).toBe(true);
  });

  it("compares secrets without accepting prefixes or length mismatches", () => {
    expect(secureEqual("correct-secret", "correct-secret")).toBe(true);
    expect(secureEqual("correct-secret", "correct")).toBe(false);
    expect(secureEqual("correct-secret", "correct-secret-extra")).toBe(false);
  });

  it("signs, expires, and rejects tampered session tokens", () => {
    const secret = "a".repeat(48);
    const now = 1_800_000_000_000;
    const token = createSessionToken({ secret, now, ttlMs: 60_000 });

    expect(verifySessionToken(token, { secret, now: now + 30_000 })).toBe(true);
    expect(verifySessionToken(token, { secret, now: now + 60_001 })).toBe(false);
    expect(verifySessionToken(`${token.slice(0, -1)}x`, { secret, now })).toBe(false);
    expect(verifySessionToken(token, { secret: "b".repeat(48), now })).toBe(false);
  });

  it("rejects cross-origin browser writes", () => {
    expect(isAllowedBrowserOrigin(undefined, "http://localhost:3000")).toBe(true);
    expect(isAllowedBrowserOrigin("http://localhost:3000", "http://localhost:3000")).toBe(true);
    expect(isAllowedBrowserOrigin("https://attacker.invalid", "http://localhost:3000")).toBe(false);
  });
});
