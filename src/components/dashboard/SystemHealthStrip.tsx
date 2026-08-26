"use client";

import { memo, useEffect, useState } from "react";
import { MappedIcon } from "@/components/ui";
import { cn } from "@/lib/utils";

type HealthData = {
  checkedAt?: number;
  host: {
    loadAverage: [number, number, number];
    cpuCores: number;
    memory: { usedPercent: number };
    disk: { usedPercent: number } | null;
  };
  openclaw: {
    gatewayRunning: boolean;
    sessionsCount: number | null;
  };
  docker: {
    runningContainers: number;
    totalContainers: number;
  };
};

function getColor(percent: number): string {
  if (percent < 60) return "var(--accent-success)";
  if (percent < 85) return "var(--accent-warning)";
  return "var(--accent-error)";
}

function HealthMetric({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: color }}
      />
      <span className="text-[11px] text-[var(--text-dim)] whitespace-nowrap">
        {label}
      </span>
      <span
        className="text-[11px] font-mono font-medium whitespace-nowrap"
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}

export const SystemHealthStrip = memo(function SystemHealthStrip({
  onExpandToggle,
  isExpanded,
}: {
  onExpandToggle: () => void;
  isExpanded: boolean;
}) {
  const [data, setData] = useState<HealthData | null>(null);
  const [error, setError] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const STREAM_STALE_AFTER_MS = 15_000;

  useEffect(() => {
    let mounted = true;
    const hydrateFromStatus = async () => {
      try {
        const response = await fetch("/api/system/status", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as HealthData;
        if (!mounted) return;
        setData(payload);
        setError(false);
        setLastUpdatedAt(payload.checkedAt ?? Date.now());
      } catch {
        // SSE stream remains the primary source.
      }
    };
    void hydrateFromStatus();

    const source = new EventSource("/api/system/stream");

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as
          | ({ ok: true } & HealthData)
          | { ok?: false; error?: string };
        if (payload.ok) {
          setData(payload);
          setError(false);
          setLastUpdatedAt(payload.checkedAt ?? Date.now());
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      }
    };

    source.onerror = () => {
      setError(true);
    };

    return () => {
      mounted = false;
      source.close();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  if (!data) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-2 mb-3 rounded-lg",
          "border border-[var(--border-subtle)]",
          "bg-[var(--bg-elevated)]"
        )}
      >
        <MappedIcon name="activity" size="xs" className="text-[var(--text-dim)]" />
        <span className="text-[11px] text-[var(--text-dim)]">
          {error ? "System status unavailable" : "Loading system status..."}
        </span>
      </div>
    );
  }

  const cpuLoad = data.host.loadAverage[0];
  const cpuPercent = Math.min((cpuLoad / data.host.cpuCores) * 100, 100);
  const ramPercent = data.host.memory.usedPercent;
  const diskPercent = data.host.disk?.usedPercent ?? 0;
  const streamAgeMs = lastUpdatedAt ? now - lastUpdatedAt : Number.POSITIVE_INFINITY;
  const streamIsStale = error || streamAgeMs > STREAM_STALE_AFTER_MS;

  return (
    <button
      onClick={onExpandToggle}
      className={cn(
        "w-full flex items-center flex-wrap gap-1 px-2 py-1 mb-3 rounded-lg",
        "border border-[var(--border-subtle)]",
        "bg-[var(--bg-elevated)]",
        "transition-all duration-150 cursor-pointer",
        "hover:border-[var(--border-default)]",
        isExpanded && "border-[var(--accent-primary)] border-opacity-40"
      )}
    >
      <div className="flex items-center gap-1.5 px-2">
        <MappedIcon name="activity" size="xs" className="text-[var(--text-muted)]" />
        <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          Health
        </span>
      </div>

        <div className="flex items-center flex-wrap">
        <HealthMetric
          label="CPU"
          value={`${cpuPercent.toFixed(0)}%`}
          color={getColor(cpuPercent)}
        />
        <HealthMetric
          label="RAM"
          value={`${ramPercent.toFixed(0)}%`}
          color={getColor(ramPercent)}
        />
        <HealthMetric
          label="Disk"
          value={`${diskPercent.toFixed(0)}%`}
          color={getColor(diskPercent)}
        />
        <HealthMetric
          label="Gateway"
          value={data.openclaw.gatewayRunning ? "Up" : "Down"}
          color={data.openclaw.gatewayRunning ? "var(--accent-success)" : "var(--accent-error)"}
        />
        <HealthMetric
          label="Docker"
          value={`${data.docker.runningContainers}/${data.docker.totalContainers}`}
          color={data.docker.runningContainers > 0 ? "var(--accent-success)" : "var(--text-dim)"}
        />
        <HealthMetric
          label="Sessions"
          value={String(data.openclaw.sessionsCount ?? 0)}
          color="var(--text-secondary)"
        />
        <HealthMetric
          label="Stream"
          value={streamIsStale ? "Stale" : "Live"}
          color={streamIsStale ? "var(--accent-warning)" : "var(--accent-success)"}
        />
      </div>

      <div className="ml-auto px-2 flex items-center gap-2">
        {lastUpdatedAt && (
          <span
            className="text-[10px]"
            style={{ color: streamIsStale ? "var(--accent-warning)" : "var(--text-dim)" }}
          >
            {streamIsStale ? "stale" : "live"} {new Date(lastUpdatedAt).toLocaleTimeString()}
          </span>
        )}
        <MappedIcon
          name={isExpanded ? "close" : "settings"}
          size="xs"
          className="text-[var(--text-dim)]"
        />
      </div>
    </button>
  );
});
