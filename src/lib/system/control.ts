import { spawn } from "node:child_process";
import { mkdir, open } from "node:fs/promises";
import path from "node:path";
import type { SafeSystemControlAction, SafeSystemControlCommand, SafeSystemControlTarget } from "@/lib/security/control";
import { requireLoopbackHttpUrl } from "@/lib/security/url";

export type SystemControlTarget = SafeSystemControlTarget;
export type SystemControlAction = SafeSystemControlAction;
export type SystemControlCommand = SafeSystemControlCommand;
export type SystemControlResult = { message: string; details?: Record<string, unknown> };

const PROCESS_PATTERNS: Record<SystemControlTarget, readonly string[]> = {
  workers: ["scripts/workers.mjs"],
  bridge: ["scripts/heartbeat-bridge.mjs"],
};

function localhostUrl(): string {
  const value = process.env.MISSION_CONTROL_URL?.trim() || "http://127.0.0.1:3000";
  return requireLoopbackHttpUrl(value);
}

function run(command: string, args: string[], timeoutMs = 5000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.once("error", (error) => { clearTimeout(timer); resolve({ code: 1, stdout, stderr: error.message }); });
    child.once("close", (code) => { clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr }); });
  });
}

async function matchingPids(target: SystemControlTarget): Promise<number[]> {
  const results = await Promise.all(PROCESS_PATTERNS[target].map((pattern) => run("pgrep", ["-f", pattern], 2500)));
  return [...new Set(results.flatMap((result) => result.code === 0
    ? result.stdout.split(/\s+/).map(Number).filter((pid) => Number.isSafeInteger(pid) && pid > 1 && pid !== process.pid)
    : []))];
}

async function stop(target: SystemControlTarget): Promise<SystemControlResult> {
  const pids = await matchingPids(target);
  for (const pid of pids) {
    try { process.kill(pid, "SIGTERM"); } catch { /* Process already exited. */ }
  }
  return { message: pids.length ? `Stopped ${pids.length} ${target} process${pids.length === 1 ? "" : "es"}` : `No ${target} process was running`, details: { pids } };
}

async function start(target: SystemControlTarget): Promise<SystemControlResult> {
  const existing = await matchingPids(target);
  if (existing.length) return { message: `${target} already running`, details: { pids: existing } };

  const script = target === "workers" ? "scripts/workers.mjs" : "scripts/heartbeat-bridge.mjs";
  const absoluteScript = path.join(process.cwd(), script);
  const logDirectory = path.join(process.cwd(), "logs");
  await mkdir(logDirectory, { recursive: true });
  const logPath = path.join(logDirectory, `${target}.runtime.log`);
  const handle = await open(logPath, "a", 0o600);
  const child = spawn(process.execPath, [absoluteScript], {
    cwd: process.cwd(),
    detached: true,
    shell: false,
    stdio: ["ignore", handle.fd, handle.fd],
    env: { ...process.env, MISSION_CONTROL_URL: localhostUrl() },
  });
  child.unref();
  await handle.close();
  return { message: `Started ${target}`, details: { pid: child.pid ?? null, logPath } };
}

export async function executeSystemControl(command: SystemControlCommand): Promise<SystemControlResult> {
  if (command.action === "start") return start(command.target);
  if (command.action === "stop") return stop(command.target);
  if (command.action === "restart") {
    const stopped = await stop(command.target);
    const started = await start(command.target);
    return { message: `Restarted ${command.target}`, details: { stopped: stopped.details, started: started.details } };
  }
  throw new Error("Unsupported control action");
}
