import os from "node:os";
import { spawn } from "node:child_process";
import { getGatewayStatus, listSessions } from "@/lib/openclaw/client";

type CommandResult = {
  stdout: string;
  stderr: string;
  code: number;
  timedOut: boolean;
  error?: string;
};

type LaunchAgentState = "running" | "loaded" | "not_loaded" | "error" | "unknown";
type ServiceState = "running" | "stopped" | "error" | "unknown";

type LaunchAgentSnapshot = {
  label: string;
  state: LaunchAgentState;
  pid: number | null;
  lastExitStatus: number | null;
  details: string;
};

type ProcessSnapshot = {
  name: string;
  pattern: string;
  running: boolean;
  count: number;
  pids: number[];
  commands: string[];
};

type ServiceSnapshot = {
  id: string;
  name: string;
  port: number;
  url: string;
  state: ServiceState;
  pid: number | null;
  process: string | null;
  httpStatus: number | null;
  latencyMs: number | null;
  details: string;
};

type DockerContainerSnapshot = {
  id: string;
  name: string;
  image: string;
  status: string;
  ports: string;
  state: "running" | "stopped" | "unknown";
};

type DockerSnapshot = {
  available: boolean;
  daemonRunning: boolean;
  version: string | null;
  containers: DockerContainerSnapshot[];
  totalContainers: number;
  runningContainers: number;
  error: string | null;
};

type OpenClawSnapshot = {
  gatewayRunning: boolean;
  gatewayPort: number | null;
  sessionsCount: number | null;
  errors: string[];
};

type MemorySnapshot = {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPercent: number;
};

type DiskSnapshot = {
  mountPoint: string;
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usedPercent: number;
} | null;

export type MonitoringSnapshot = {
  checkedAt: number;
  host: {
    hostname: string;
    platform: string;
    release: string;
    arch: string;
    cpuCores: number;
    uptimeSeconds: number;
    loadAverage: [number, number, number];
    memory: MemorySnapshot;
    disk: DiskSnapshot;
  };
  openclaw: OpenClawSnapshot;
  launchAgents: LaunchAgentSnapshot[];
  docker: DockerSnapshot;
  services: ServiceSnapshot[];
  processes: ProcessSnapshot[];
};

type ProcessEntry = {
  pid: number;
  command: string;
};

type PortListener = {
  pid: number;
  command: string;
} | null;

const MONITORED_LAUNCH_AGENTS = (process.env.MONITORED_LAUNCH_AGENTS ?? "")
  .split(",")
  .map((label) => label.trim())
  .filter(Boolean);

const MONITORED_PROCESSES = [
  { name: "Next.js dev server", pattern: "next dev" },
  { name: "Convex dev server", pattern: "convex dev" },
  { name: "Workers supervisor", pattern: "scripts/workers.mjs" },
  { name: "Heartbeat bridge", pattern: "scripts/heartbeat-bridge.mjs" },
  { name: "Sync worker", pattern: "scripts/sync-worker.mjs" },
  { name: "Activity watcher", pattern: "scripts/activity-watcher.mjs" },
  { name: "OpenClaw gateway process", pattern: "openclaw gateway" },
];

type ServiceCheck = {
  id: string;
  name: string;
  port: number;
  url: string;
};

function normalizeServicePort(url: URL): number {
  if (url.port) {
    const parsed = Number.parseInt(url.port, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return url.protocol === "https:" ? 443 : 80;
}

function resolveServiceCheck(
  id: string,
  name: string,
  fallbackUrl: string
): ServiceCheck {
  try {
    const parsed = new URL(fallbackUrl);
    return {
      id,
      name,
      port: normalizeServicePort(parsed),
      url: parsed.toString(),
    };
  } catch {
    const parsed = new URL("http://127.0.0.1:3000/");
    return {
      id,
      name,
      port: normalizeServicePort(parsed),
      url: parsed.toString(),
    };
  }
}

function buildMonitoredServices(): ServiceCheck[] {
  const missionControlPort = process.env.MISSION_CONTROL_PORT?.trim() || "3000";
  const missionControlUrl =
    process.env.MISSION_CONTROL_URL?.trim() || `http://127.0.0.1:${missionControlPort}/`;
  const gatewayUrl =
    process.env.OPENCLAW_GATEWAY_URL?.trim() || "http://127.0.0.1:18789/";

  const services: ServiceCheck[] = [
    resolveServiceCheck("openclaw-mission-control-ui", "OpenClaw Mission Control UI", missionControlUrl),
    resolveServiceCheck("openclaw-gateway", "OpenClaw gateway", gatewayUrl),
  ];

  const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL?.trim();

  if (!convexSiteUrl) return services;

  try {
    const parsed = new URL(convexSiteUrl);
    const port =
      parsed.port !== ""
        ? Number.parseInt(parsed.port, 10)
        : parsed.protocol === "https:"
          ? 443
          : 80;
    const probeUrl = new URL("/api/activity/recent?limit=1", parsed).toString();

    services.push({
      id: "convex-site",
      name: parsed.hostname.includes("127.0.0.1") || parsed.hostname.includes("localhost")
        ? "Convex site API (local)"
        : "Convex site API",
      port,
      url: probeUrl,
    });
  } catch {
    // Ignore invalid optional monitoring URLs.
  }

  return services;
}

const CACHE_TTL_MS = 5000;
let snapshotCache: { expiresAt: number; value: MonitoringSnapshot } | null = null;
let snapshotInflight: Promise<MonitoringSnapshot> | null = null;

function runCommand(
  command: string,
  args: string[],
  timeoutMs = 5000
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 250);
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr: stderr || error.message,
        code: 1,
        timedOut,
        error: error.message,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        code: code ?? 0,
        timedOut,
      });
    });
  });
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJsonLines<T extends object>(raw: string): T[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const parsed: T[] = [];

  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line) as T);
    } catch {
      // Ignore malformed lines.
    }
  }

  return parsed;
}

async function getDiskSnapshot(): Promise<DiskSnapshot> {
  const result = await runCommand("df", ["-kP", "/"], 3000);
  if (result.code !== 0 || !result.stdout.trim()) {
    return null;
  }

  const lines = result.stdout
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return null;
  }

  const columns = lines[1].split(/\s+/);
  if (columns.length < 6) {
    return null;
  }

  const totalKb = parseNumber(columns[1]);
  const usedKb = parseNumber(columns[2]);
  const availableKb = parseNumber(columns[3]);
  const usedPercentRaw = columns[4];
  const mountPoint = columns.slice(5).join(" ");

  if (totalKb === null || usedKb === null || availableKb === null) {
    return null;
  }

  const usedPercent = Number.parseFloat(usedPercentRaw.replace("%", ""));
  return {
    mountPoint,
    totalBytes: totalKb * 1024,
    usedBytes: usedKb * 1024,
    availableBytes: availableKb * 1024,
    usedPercent: Number.isFinite(usedPercent)
      ? usedPercent
      : Number(((usedKb / totalKb) * 100).toFixed(1)),
  };
}

async function getOpenClawSnapshot(): Promise<OpenClawSnapshot> {
  const errors: string[] = [];
  let gatewayRunning = false;
  let gatewayPort: number | null = null;
  let sessionsCount: number | null = null;

  try {
    const gateway = await getGatewayStatus();
    gatewayRunning = gateway.running;
    gatewayPort = gateway.port ?? null;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Failed to read gateway status");
  }

  try {
    const sessions = await listSessions();
    sessionsCount = sessions.length;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Failed to list OpenClaw sessions");
  }

  return {
    gatewayRunning,
    gatewayPort,
    sessionsCount,
    errors,
  };
}

async function getLaunchAgentSnapshot(): Promise<LaunchAgentSnapshot[]> {
  const result = await runCommand("launchctl", ["list"], 5000);
  if (result.code !== 0) {
    const reason = result.stderr.trim() || "launchctl list failed";
    return MONITORED_LAUNCH_AGENTS.map((label) => ({
      label,
      state: "unknown",
      pid: null,
      lastExitStatus: null,
      details: reason,
    }));
  }

  const entries = new Map<string, { pid: number | null; lastExitStatus: number | null }>();
  const lines = result.stdout.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("PID") || trimmed.startsWith("-\t")) {
      continue;
    }

    const cols = trimmed.split(/\s+/);
    if (cols.length < 3) continue;
    const pid = cols[0] === "-" ? null : parseNumber(cols[0]);
    const lastExitStatus = parseNumber(cols[1]);
    const label = cols.slice(2).join(" ");
    entries.set(label, { pid, lastExitStatus });
  }

  return MONITORED_LAUNCH_AGENTS.map((label) => {
    const entry = entries.get(label);
    if (!entry) {
      return {
        label,
        state: "not_loaded",
        pid: null,
        lastExitStatus: null,
        details: "Not loaded in launchctl",
      };
    }

    if (entry.pid && entry.pid > 0) {
      return {
        label,
        state: "running",
        pid: entry.pid,
        lastExitStatus: entry.lastExitStatus,
        details: `Running (pid ${entry.pid})`,
      };
    }

    if (entry.lastExitStatus !== null && entry.lastExitStatus !== 0) {
      return {
        label,
        state: "error",
        pid: null,
        lastExitStatus: entry.lastExitStatus,
        details: `Loaded, last exit status ${entry.lastExitStatus}`,
      };
    }

    return {
      label,
      state: "loaded",
      pid: null,
      lastExitStatus: entry.lastExitStatus,
      details: "Loaded, waiting for next run",
    };
  });
}

async function getDockerSnapshot(): Promise<DockerSnapshot> {
  const infoResult = await runCommand("docker", ["info", "--format", "{{json .}}"], 5000);
  if (infoResult.code !== 0) {
    const errorText = (infoResult.stderr || infoResult.error || "Docker unavailable").trim();
    const isMissing = /enoent|not found|no such file/i.test(errorText);
    const daemonDown = /cannot connect to the docker daemon/i.test(errorText);

    return {
      available: !isMissing,
      daemonRunning: false,
      version: null,
      containers: [],
      totalContainers: 0,
      runningContainers: 0,
      error: daemonDown ? "Docker daemon is not running" : errorText,
    };
  }

  let version: string | null = null;
  try {
    const info = JSON.parse(infoResult.stdout) as { ServerVersion?: string };
    version = typeof info.ServerVersion === "string" ? info.ServerVersion : null;
  } catch {
    version = null;
  }

  const allResult = await runCommand("docker", ["ps", "-a", "--format", "{{json .}}"], 4000);
  const allContainersRaw = parseJsonLines<{
    ID?: string;
    Names?: string;
    Image?: string;
    Status?: string;
    Ports?: string;
  }>(allResult.stdout);

  const containers: DockerContainerSnapshot[] = allContainersRaw.map((container) => {
    const status = container.Status ?? "unknown";
    let state: "running" | "stopped" | "unknown" = "unknown";
    if (/^up\b/i.test(status)) {
      state = "running";
    } else if (/^(exited|created|paused|restarting)\b/i.test(status)) {
      state = "stopped";
    }

    return {
      id: container.ID ?? "",
      name: container.Names ?? "unknown",
      image: container.Image ?? "unknown",
      status,
      ports: container.Ports ?? "",
      state,
    };
  });
  const runningContainers = containers.filter((container) => container.state === "running").length;

  return {
    available: true,
    daemonRunning: true,
    version,
    containers,
    totalContainers: containers.length,
    runningContainers,
    error: null,
  };
}

async function getProcessEntries(): Promise<ProcessEntry[]> {
  const result = await runCommand("ps", ["-ax", "-o", "pid=,command="], 5000);
  if (result.code !== 0) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      if (!match) return null;
      return {
        pid: Number.parseInt(match[1], 10),
        command: match[2],
      };
    })
    .filter((entry): entry is ProcessEntry => entry !== null);
}

function buildProcessSnapshots(processes: ProcessEntry[]): ProcessSnapshot[] {
  return MONITORED_PROCESSES.map((item) => {
    const pattern = item.pattern.toLowerCase();
    const matches = processes.filter((entry) =>
      entry.command.toLowerCase().includes(pattern) &&
      !entry.command.toLowerCase().startsWith("bash -lc")
    );
    return {
      name: item.name,
      pattern: item.pattern,
      running: matches.length > 0,
      count: matches.length,
      pids: matches.map((entry) => entry.pid),
      commands: matches.slice(0, 3).map((entry) => entry.command),
    };
  });
}

async function getPortListener(port: number): Promise<PortListener> {
  const result = await runCommand("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], 3000);
  if (result.code !== 0) {
    return null;
  }

  const lines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return null;
  }

  const firstMatch = lines[1].match(/^(\S+)\s+(\d+)\s+/);
  if (!firstMatch) {
    return null;
  }

  return {
    command: firstMatch[1],
    pid: Number.parseInt(firstMatch[2], 10),
  };
}

async function probeHttp(
  url: string
): Promise<{ reachable: boolean; status: number | null; latencyMs: number | null; error: string | null }> {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    return {
      reachable: true,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      error: null,
    };
  } catch (error) {
    return {
      reachable: false,
      status: null,
      latencyMs: null,
      error: error instanceof Error ? error.message : "Request failed",
    };
  }
}

async function getServiceSnapshots(): Promise<ServiceSnapshot[]> {
  const monitoredServices = buildMonitoredServices();
  const portSet = new Set<number>();
  for (const service of monitoredServices) {
    portSet.add(service.port);
  }

  const listenerEntries = await Promise.all(
    [...portSet].map(async (port) => [port, await getPortListener(port)] as const)
  );
  const listeners = new Map<number, PortListener>(listenerEntries);

  return Promise.all(
    monitoredServices.map(async (service) => {
      const listener = listeners.get(service.port) ?? null;
      const probe = await probeHttp(service.url);
      const hasHealthyHttp = probe.reachable && (probe.status ?? 0) >= 200 && (probe.status ?? 0) < 400;
      const hasUnhealthyHttp = probe.reachable && !hasHealthyHttp;

      let state: ServiceState = "stopped";
      if (listener && hasHealthyHttp) {
        state = "running";
      } else if (listener && !probe.reachable) {
        state = "running";
      } else if (!listener && hasHealthyHttp) {
        state = "running";
      } else if (hasUnhealthyHttp) {
        state = "error";
      } else if (probe.error) {
        state = "stopped";
      }

      const detailsParts: string[] = [];
      if (listener) {
        detailsParts.push(`pid ${listener.pid} (${listener.command})`);
      } else {
        detailsParts.push("no LISTEN process");
      }
      if (probe.reachable) {
        detailsParts.push(`http ${probe.status ?? "?"}`);
      } else if (probe.error) {
        detailsParts.push(probe.error);
      }

      return {
        id: service.id,
        name: service.name,
        port: service.port,
        url: service.url,
        state,
        pid: listener?.pid ?? null,
        process: listener?.command ?? null,
        httpStatus: probe.status,
        latencyMs: probe.latencyMs,
        details: detailsParts.join(" | "),
      };
    })
  );
}

async function collectSnapshot(): Promise<MonitoringSnapshot> {
  const [disk, openclaw, launchAgents, docker, services, processEntries] =
    await Promise.all([
      getDiskSnapshot(),
      getOpenClawSnapshot(),
      getLaunchAgentSnapshot(),
      getDockerSnapshot(),
      getServiceSnapshots(),
      getProcessEntries(),
    ]);

  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = Math.max(totalMemory - freeMemory, 0);
  const usedPercent = totalMemory > 0 ? Number(((usedMemory / totalMemory) * 100).toFixed(1)) : 0;

  return {
    checkedAt: Date.now(),
    host: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpuCores: os.cpus().length,
      uptimeSeconds: os.uptime(),
      loadAverage: os.loadavg() as [number, number, number],
      memory: {
        totalBytes: totalMemory,
        freeBytes: freeMemory,
        usedBytes: usedMemory,
        usedPercent,
      },
      disk,
    },
    openclaw,
    launchAgents,
    docker,
    services,
    processes: buildProcessSnapshots(processEntries),
  };
}

export async function collectSystemMonitoringSnapshot(): Promise<MonitoringSnapshot> {
  if (snapshotCache && Date.now() < snapshotCache.expiresAt) {
    return snapshotCache.value;
  }
  if (snapshotInflight) {
    return snapshotInflight;
  }

  snapshotInflight = collectSnapshot();
  try {
    const value = await snapshotInflight;
    snapshotCache = {
      value,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    return value;
  } finally {
    snapshotInflight = null;
  }
}
