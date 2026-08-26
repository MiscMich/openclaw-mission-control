import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

const spawnMock = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
  default: {
    spawn: (...args: unknown[]) => spawnMock(...args),
  },
}));

vi.mock("@/lib/convexServer", () => ({
  convex: {
    query: vi.fn().mockResolvedValue(undefined),
  },
  api: {
    settings: {
      get: "settings.get",
    },
  },
}));

describe("listSessions", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("returns stale cached sessions when the gateway call fails after cache expiry", async () => {
    let now = new Date("2020-01-01T00:00:00Z").valueOf();
    vi.spyOn(Date, "now").mockImplementation(() => now);

    const gatewayResponses: Array<
      | { ok: true; sessions: Array<{ key: string; updatedAt: number }> }
      | { ok: false; error?: string }
    > = [
      {
        ok: true,
        sessions: [{ key: "agent:main:1", updatedAt: now }],
      },
      {
        ok: false,
        error: "gateway down",
      },
    ];

    spawnMock.mockImplementation((_command, args: string[]) => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: PassThrough;
        stderr: PassThrough;
      };
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();

      queueMicrotask(() => {
        const argString = args.join(" ");
        if (argString.includes("sessions.list")) {
          const response = gatewayResponses.shift();
          if (!response) {
            child.stderr.end("missing response");
            child.emit("close", 1);
            return;
          }
          if (response.ok) {
            child.stdout.end(JSON.stringify({ sessions: response.sessions }));
            child.stderr.end();
            child.emit("close", 0);
            return;
          }
          child.stderr.end(response.error ?? "gateway error");
          child.emit("close", 1);
          return;
        }

        if (args[0] === "sessions" || argString.includes("gateway call status")) {
          child.stderr.end("unexpected fallback");
          child.emit("close", 1);
          return;
        }

        child.stderr.end("unexpected command");
        child.emit("close", 1);
      });

      return child as unknown as ReturnType<typeof spawnMock>;
    });

    const { listSessions } = await import("@/lib/openclaw/client");

    const initialSessions = await listSessions();
    expect(initialSessions).toHaveLength(1);

    now += 6000;

    const cachedSessions = await listSessions();
    expect(cachedSessions).toEqual(initialSessions);

    const spawnArgs = spawnMock.mock.calls.map((call) => call[1] as string[]);
    expect(spawnArgs.filter((args) => args.includes("sessions.list"))).toHaveLength(2);
    expect(spawnArgs.some((args) => args[0] === "sessions")).toBe(false);
  });
});
