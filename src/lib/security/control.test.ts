import { describe, expect, it } from "vitest";
import { parseSystemControlCommand } from "./control";

describe("system control request allowlist", () => {
  it.each([
    ["workers", "start"],
    ["workers", "stop"],
    ["workers", "restart"],
    ["bridge", "start"],
    ["bridge", "stop"],
    ["bridge", "restart"],
  ])("allows %s %s", (target, action) => {
    expect(parseSystemControlCommand({ target, action })).toEqual({ target, action });
  });

  it.each([
    { target: "launchAgent", action: "load", label: "service; rm -rf /" },
    { target: "dockerContainer", action: "restart", containerId: "$(touch /tmp/pwned)" },
    { target: "workers", action: "load" },
    { target: "workers", action: "restart; whoami" },
  ])("rejects unconfigured or injectable control input", (payload) => {
    expect(() => parseSystemControlCommand(payload)).toThrow(/invalid|unsupported/i);
  });
});
