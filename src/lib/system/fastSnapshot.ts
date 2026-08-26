import os from "node:os";
import { getGatewayStatus } from "@/lib/openclaw/client";
import type { MonitoringSnapshot } from "@/lib/system/monitor";

function toPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export const SYSTEM_SNAPSHOT_TIMEOUT_MS = toPositiveInt(
  process.env.SYSTEM_SNAPSHOT_TIMEOUT_MS,
  1800
);
const GATEWAY_FALLBACK_TIMEOUT_MS = toPositiveInt(
  process.env.SYSTEM_GATEWAY_FALLBACK_TIMEOUT_MS,
  800
);

export class SnapshotTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotTimeoutError";
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new SnapshotTimeoutError(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export async function buildFallbackMonitoringSnapshot(
  reason: string
): Promise<MonitoringSnapshot> {
  const now = Date.now();
  let gatewayRunning = false;
  let gatewayPort: number | null = null;
  const errors = [reason];

  try {
    const gateway = await withTimeout(
      getGatewayStatus(),
      GATEWAY_FALLBACK_TIMEOUT_MS,
      `Gateway status timed out after ${GATEWAY_FALLBACK_TIMEOUT_MS}ms`
    );
    gatewayRunning = gateway.running;
    gatewayPort = gateway.port ?? null;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Gateway status unavailable");
  }

  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = Math.max(totalMemory - freeMemory, 0);
  const usedPercent = totalMemory > 0 ? Number(((usedMemory / totalMemory) * 100).toFixed(1)) : 0;

  return {
    checkedAt: now,
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
      disk: null,
    },
    openclaw: {
      gatewayRunning,
      gatewayPort,
      sessionsCount: null,
      errors: Array.from(new Set(errors)).slice(0, 3),
    },
    launchAgents: [],
    docker: {
      available: false,
      daemonRunning: false,
      version: null,
      containers: [],
      totalContainers: 0,
      runningContainers: 0,
      error: reason,
    },
    services: [],
    processes: [],
  };
}
