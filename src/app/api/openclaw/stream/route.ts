import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { resolveOpenClawExecutionContext } from "@/lib/openclaw/client";

export const runtime = "nodejs";

const encoder = new TextEncoder();
const KEEPALIVE_MS = 5_000;
const MAX_STREAM_LINE_CHARS = 4000;
const CONFIG_NOISY_STDERR_PATTERNS = [
  /invalid config at .*openclaw\.json/i,
  /tools\.web\.search\.provider:\s*invalid input/i,
  /tools\.web\.search:\s*unrecognized key:\s*"grok"/i,
  /^config invalid$/i,
  /^file:\s*~\/\.openclaw\/openclaw\.json$/i,
  /^problem:$/i,
  /^run:\s*openclaw doctor --fix$/i,
];
const DEPRECATION_NOISY_STDERR_PATTERNS = [
  /\[dep0040\]\s*deprecationwarning:\s*the `punycode` module is deprecated/i,
  /use `node --trace-deprecation .*` to show where the warning was created/i,
];

type SessionFilter = {
  raw: string;
  id: string;
};

function toSessionFilter(value: string | null): SessionFilter | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  const parts = raw.split(":").filter(Boolean);
  const id = parts.length >= 3 ? parts[parts.length - 1] : raw;
  return { raw, id };
}

function matchesFilters(
  line: string,
  filters: { agent: string | null; session: SessionFilter | null }
) {
  const haystack = line.toLowerCase();
  if (filters.agent && !haystack.includes(filters.agent)) return false;
  if (filters.session) {
    const hasSessionRaw = haystack.includes(filters.session.raw);
    const hasSessionId = haystack.includes(filters.session.id);
    if (!hasSessionRaw && !hasSessionId) return false;
  }
  return true;
}

function classifyNoisyStderr(line: string): "config" | "deprecation" | null {
  if (CONFIG_NOISY_STDERR_PATTERNS.some((pattern) => pattern.test(line))) {
    return "config";
  }
  if (DEPRECATION_NOISY_STDERR_PATTERNS.some((pattern) => pattern.test(line))) {
    return "deprecation";
  }
  return null;
}

function normalizeLogLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as {
      level?: unknown;
      subsystem?: unknown;
      message?: unknown;
      text?: unknown;
      line?: unknown;
    };

    const level =
      typeof parsed.level === "string" ? parsed.level.toLowerCase().trim() : "";
    const subsystem =
      typeof parsed.subsystem === "string" ? parsed.subsystem.toLowerCase().trim() : "";

    // OpenClaw diagnostic/debug noise is high-volume and not actionable in UI.
    if (subsystem === "diagnostic" && level === "debug") {
      return null;
    }

    const preferred =
      typeof parsed.message === "string"
        ? parsed.message
        : typeof parsed.text === "string"
          ? parsed.text
          : typeof parsed.line === "string"
            ? parsed.line
            : "";
    if (!preferred.trim()) {
      return trimmed;
    }

    return preferred.trim();
  } catch {
    return trimmed;
  }
}

function truncateLine(line: string) {
  if (line.length <= MAX_STREAM_LINE_CHARS) return line;
  return `${line.slice(0, MAX_STREAM_LINE_CHARS)} ...[truncated]`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const agentFilter = url.searchParams.get("agent")?.trim().toLowerCase() || null;
  const sessionFilter = toSessionFilter(url.searchParams.get("session"));
  let openclawCli = process.env.OPENCLAW_CLI ?? "openclaw";
  let commandEnv: NodeJS.ProcessEnv = process.env;
  try {
    const context = await resolveOpenClawExecutionContext();
    openclawCli = context.cli;
    commandEnv = context.env;
  } catch {
    // Use process env fallback.
  }
  const customCommand = process.env.OPENCLAW_LOGS_COMMAND?.trim();
  const commandParts = customCommand?.split(/\s+/).filter(Boolean) ?? [];
  const commandBin = commandParts[0] ?? openclawCli;
  const commandArgs =
    commandParts.length > 1 ? commandParts.slice(1) : ["logs", "--follow", "--json"];

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let buffer = "";
      let hasSuppressedStderrNotice = false;
      const child = spawn(commandBin, commandArgs, {
        stdio: ["ignore", "pipe", "pipe"],
        env: commandEnv,
      });

      const safeEnqueue = (data: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(data);
        } catch {
          // Controller already closed
          closed = true;
        }
      };

      const safeClose = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };

      const sendLine = (type: "log" | "stderr" | "error", line: string) => {
        const safeLine = truncateLine(line);
        const payload = JSON.stringify({
          type,
          line: safeLine,
          ts: Date.now(),
        });
        safeEnqueue(encoder.encode(`data: ${payload}\n\n`));
      };

      const flushBufferedLines = (type: "log" | "stderr") => {
        if (!buffer) return;
        const parts = buffer.split(/\r?\n/);
        buffer = parts.pop() ?? "";
        for (const line of parts) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (!matchesFilters(trimmed, { agent: agentFilter, session: sessionFilter })) {
            continue;
          }
          const normalized = type === "log" ? normalizeLogLine(trimmed) : trimmed;
          if (!normalized) continue;
          sendLine(type, normalized);
        }
      };

      const onStdoutData = (chunk: Buffer) => {
        buffer += chunk.toString();
        flushBufferedLines("log");
      };

      const onStderrData = (chunk: Buffer) => {
        const lines = chunk.toString().split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const noisyType = classifyNoisyStderr(trimmed);
          if (noisyType === "deprecation") {
            continue;
          }
          if (noisyType === "config") {
            if (!hasSuppressedStderrNotice) {
              hasSuppressedStderrNotice = true;
              sendLine(
                "stderr",
                "[OpenClaw config/deprecation warnings suppressed. Review /settings]"
              );
            }
            continue;
          }
          sendLine("stderr", trimmed);
        }
      };

      const keepalive = setInterval(() => {
        safeEnqueue(encoder.encode(": keepalive\n\n"));
      }, KEEPALIVE_MS);

      sendLine(
        "log",
        `[log stream connected${agentFilter ? ` | agent:${agentFilter}` : ""}${
          sessionFilter ? ` | session:${sessionFilter.id}` : ""
        }]`
      );

      const cleanup = () => {
        clearInterval(keepalive);
        child.stdout?.off("data", onStdoutData);
        child.stderr?.off("data", onStderrData);
        if (!child.killed) {
          child.kill("SIGTERM");
        }
      };

      const handleAbort = () => {
        cleanup();
        safeClose();
      };

      request.signal.addEventListener("abort", handleAbort, { once: true });

      child.stdout?.on("data", onStdoutData);
      child.stderr?.on("data", onStderrData);

      child.on("close", () => {
        flushBufferedLines("log");
        cleanup();
        safeClose();
      });

      child.on("error", (err) => {
        sendLine("error", err.message);
        cleanup();
        safeClose();
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
