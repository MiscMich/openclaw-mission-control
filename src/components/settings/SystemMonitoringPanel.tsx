"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MappedIcon } from "@/components/ui";
import { TimeAgo } from "@/components/ui/TimeAgo";
import { toast } from "sonner";

type LaunchAgentState = "running" | "loaded" | "not_loaded" | "error" | "unknown";
type ServiceState = "running" | "stopped" | "error" | "unknown";
type ControlTarget = "workers" | "bridge" | "launchAgent" | "dockerContainer";
type ControlAction = "start" | "stop" | "restart" | "load" | "unload";

type MonitoringSnapshot = {
  checkedAt: number;
  host: {
    hostname: string;
    platform: string;
    release: string;
    arch: string;
    cpuCores: number;
    uptimeSeconds: number;
    loadAverage: [number, number, number];
    memory: {
      totalBytes: number;
      freeBytes: number;
      usedBytes: number;
      usedPercent: number;
    };
    disk: {
      mountPoint: string;
      totalBytes: number;
      usedBytes: number;
      availableBytes: number;
      usedPercent: number;
    } | null;
  };
  openclaw: {
    gatewayRunning: boolean;
    gatewayPort: number | null;
    sessionsCount: number | null;
    errors: string[];
  };
  launchAgents: {
    label: string;
    state: LaunchAgentState;
    pid: number | null;
    lastExitStatus: number | null;
    details: string;
  }[];
  docker: {
    available: boolean;
    daemonRunning: boolean;
    version: string | null;
    containers: {
      id: string;
      name: string;
      image: string;
      status: string;
      ports: string;
      state: "running" | "stopped" | "unknown";
    }[];
    totalContainers: number;
    runningContainers: number;
    error: string | null;
  };
  services: {
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
  }[];
  processes: {
    name: string;
    pattern: string;
    running: boolean;
    count: number;
    pids: number[];
    commands: string[];
  }[];
};

type ApiResponse =
  | ({ ok: true } & MonitoringSnapshot)
  | { ok: false; error?: string; checkedAt?: number };

type ControlRequest = {
  target: ControlTarget;
  action: ControlAction;
  label?: string;
  containerId?: string;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatUptime(seconds: number): string {
  const total = Math.max(Math.floor(seconds), 0);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function stateTone(state: string): {
  label: string;
  className: string;
  icon: "success" | "warning" | "error" | "idle";
} {
  if (state === "running" || state === "loaded") {
    return { label: state === "running" ? "Running" : "Loaded", className: "good", icon: "success" };
  }
  if (state === "error") {
    return { label: "Error", className: "bad", icon: "error" };
  }
  if (state === "unknown") {
    return { label: "Unknown", className: "warn", icon: "warning" };
  }
  return { label: "Stopped", className: "muted", icon: "idle" };
}

function HealthPill({ state }: { state: string }) {
  const tone = stateTone(state);
  return (
    <span className={`health-pill ${tone.className}`}>
      <MappedIcon name={tone.icon} size="xs" />
      {tone.label}
    </span>
  );
}

export function SystemMonitoringPanel() {
  const [snapshot, setSnapshot] = useState<MonitoringSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    setError(null);

    try {
      const response = await fetch("/api/system/status", {
        cache: "no-store",
      });
      const payload = (await response.json()) as ApiResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(
          payload && typeof payload === "object" && "error" in payload
            ? payload.error || "Failed to load system status"
            : "Failed to load system status"
        );
      }
      setSnapshot(payload);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load system status");
    } finally {
      setLoading(false);
      if (manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/system/stream");

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as ApiResponse;
        if (payload.ok) {
          setSnapshot(payload);
          setError(null);
        } else {
          setError(payload.error || "Failed to load system status");
        }
      } catch {
        setError("Invalid system stream payload");
      } finally {
        setLoading(false);
      }
    };

    source.onerror = () => {
      setError((current) => current || "System stream disconnected");
      setLoading(false);
    };

    return () => {
      source.close();
    };
  }, []);

  const runControl = useCallback(
    async (request: ControlRequest, description: string) => {
      const key = `${request.target}:${request.action}:${request.label ?? request.containerId ?? ""}`;
      setActionKey(key);
      try {
        const response = await fetch("/api/system/control", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(request),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          message?: string;
          error?: string;
        };
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Failed to ${description}`);
        }
        toast.success(payload.message || `Requested ${description}`);
        await load(true);
      } catch (controlError) {
        toast.error(controlError instanceof Error ? controlError.message : `Failed to ${description}`);
      } finally {
        setActionKey(null);
      }
    },
    [load]
  );

  const serviceSummary = useMemo(() => {
    const services = snapshot?.services ?? [];
    const running = services.filter((service) => service.state === "running").length;
    return {
      total: services.length,
      running,
    };
  }, [snapshot?.services]);

  return (
    <section className="section-card">
      <div className="section-header">
        <h2 className="section-title">Health</h2>
        <div className="monitor-header-actions">
          {snapshot?.checkedAt && (
            <span className="monitor-updated">
              Updated <TimeAgo timestamp={snapshot.checkedAt} />
            </span>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => load(true)} disabled={refreshing}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="section-body">
        <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
          A quick health check for the machine and services that keep agents running. Mostly for troubleshooting.
        </p>
        {loading && !snapshot ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="skeleton h-16 rounded-lg" style={{ opacity: 1 - index * 0.15 }} />
            ))}
          </div>
        ) : error ? (
          <div className="monitor-error">{error}</div>
        ) : snapshot ? (
          <div className="monitor-stack">
            <div className="monitor-grid">
              <div className="monitor-card">
                <div className="monitor-card-title">
                  <MappedIcon name="settings" size="sm" />
                  Computer
                </div>
                <div className="monitor-rows">
                  <div className="monitor-row">
                    <span>Machine</span>
                    <strong>{snapshot.host.hostname}</strong>
                  </div>
                  <div className="monitor-row">
                    <span>Platform</span>
                    <strong>
                      {snapshot.host.platform} {snapshot.host.release} ({snapshot.host.arch})
                    </strong>
                  </div>
                  <div className="monitor-row">
                    <span>CPU</span>
                    <strong>{snapshot.host.cpuCores} cores</strong>
                  </div>
                  <div className="monitor-row">
                    <span>Uptime</span>
                    <strong>{formatUptime(snapshot.host.uptimeSeconds)}</strong>
                  </div>
                </div>

                <div className="metric-block">
                  <div className="metric-label">
                    Memory
                    <span>{snapshot.host.memory.usedPercent.toFixed(1)}%</span>
                  </div>
                  <div className="metric-bar">
                    <div style={{ width: `${Math.min(snapshot.host.memory.usedPercent, 100)}%` }} />
                  </div>
                  <div className="metric-footnote">
                    {formatBytes(snapshot.host.memory.usedBytes)} / {formatBytes(snapshot.host.memory.totalBytes)}
                  </div>
                </div>

                <div className="metric-block">
                  <div className="metric-label">
                    Disk {snapshot.host.disk?.mountPoint ?? "/"}
                    <span>{snapshot.host.disk ? `${snapshot.host.disk.usedPercent.toFixed(1)}%` : "n/a"}</span>
                  </div>
                  <div className="metric-bar">
                    <div style={{ width: `${Math.min(snapshot.host.disk?.usedPercent ?? 0, 100)}%` }} />
                  </div>
                  <div className="metric-footnote">
                    {snapshot.host.disk
                      ? `${formatBytes(snapshot.host.disk.usedBytes)} / ${formatBytes(snapshot.host.disk.totalBytes)}`
                      : "Disk usage unavailable"}
                  </div>
                </div>
              </div>

              <div className="monitor-card">
                <div className="monitor-card-title">
                  <MappedIcon name="activity" size="sm" />
                  Services
                </div>
                <div className="summary-list">
                  <div className="summary-item">
                    <span>Backend</span>
                    <HealthPill state={snapshot.openclaw.gatewayRunning ? "running" : "stopped"} />
                  </div>
                  <div className="summary-item">
                    <span>Backend port</span>
                    <strong>{snapshot.openclaw.gatewayPort ?? "n/a"}</strong>
                  </div>
                  <div className="summary-item">
                    <span>Active Sessions</span>
                    <strong>{snapshot.openclaw.sessionsCount ?? "n/a"}</strong>
                  </div>
                  <div className="summary-item">
                    <span>Docker Daemon</span>
                    <HealthPill
                      state={
                        snapshot.docker.available
                          ? snapshot.docker.daemonRunning
                            ? "running"
                            : "stopped"
                          : "unknown"
                      }
                    />
                  </div>
                  <div className="summary-item">
                    <span>Docker Containers</span>
                    <strong>
                      {snapshot.docker.runningContainers}/{snapshot.docker.totalContainers}
                    </strong>
                  </div>
                  <div className="summary-item">
                    <span>Local Services</span>
                    <strong>
                      {serviceSummary.running}/{serviceSummary.total}
                    </strong>
                  </div>
                </div>
                {snapshot.openclaw.errors.length > 0 && (
                  <div className="monitor-notice">
                    {snapshot.openclaw.errors.join(" | ")}
                  </div>
                )}
                {snapshot.docker.error && <div className="monitor-notice">{snapshot.docker.error}</div>}
                <div className="control-stack">
                  <div className="control-row">
                    <span>Background workers</span>
                    <div className="control-buttons">
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => runControl({ target: "workers", action: "start" }, "start workers")}
                        disabled={actionKey === "workers:start:"}
                      >
                        Start
                      </button>
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => runControl({ target: "workers", action: "stop" }, "stop workers")}
                        disabled={actionKey === "workers:stop:"}
                      >
                        Stop
                      </button>
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => runControl({ target: "workers", action: "restart" }, "restart workers")}
                        disabled={actionKey === "workers:restart:"}
                      >
                        Restart
                      </button>
                    </div>
                  </div>
                  <div className="control-row">
                    <span>Message bridge</span>
                    <div className="control-buttons">
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => runControl({ target: "bridge", action: "start" }, "start bridge")}
                        disabled={actionKey === "bridge:start:"}
                      >
                        Start
                      </button>
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => runControl({ target: "bridge", action: "stop" }, "stop bridge")}
                        disabled={actionKey === "bridge:stop:"}
                      >
                        Stop
                      </button>
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => runControl({ target: "bridge", action: "restart" }, "restart bridge")}
                        disabled={actionKey === "bridge:restart:"}
                      >
                        Restart
                      </button>
                    </div>
                  </div>
                </div>
                <div className="load-row">
                  <span>Load Avg (1m / 5m / 15m)</span>
                  <strong>
                    {snapshot.host.loadAverage.map((value) => value.toFixed(2)).join(" / ")}
                  </strong>
                </div>
              </div>
            </div>

            <div className="monitor-card">
              <div className="monitor-card-title">
                <MappedIcon name="terminal" size="sm" />
                Local Services
              </div>
              <div className="table-like">
                {snapshot.services.map((service) => (
                  <div key={service.id} className="table-row">
                    <div className="table-col name">
                      <div>{service.name}</div>
                      <small>{service.url}</small>
                    </div>
                    <div className="table-col">
                      <HealthPill state={service.state} />
                    </div>
                    <div className="table-col mono">:{service.port}</div>
                    <div className="table-col mono">{service.httpStatus ?? "n/a"}</div>
                    <div className="table-col mono">{service.pid ?? "n/a"}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="monitor-grid">
              <div className="monitor-card">
                <div className="monitor-card-title">
                  <MappedIcon name="clock" size="sm" />
                  Launch Agents
                </div>
                <div className="table-like compact">
                  {snapshot.launchAgents.map((agent) => (
                    <div key={agent.label} className="table-row">
                      <div className="table-col name">
                        <div>{agent.label}</div>
                        <small>{agent.details}</small>
                      </div>
                      <div className="table-col">
                        <HealthPill state={agent.state} />
                      </div>
                      <div className="table-col mono">{agent.pid ?? "n/a"}</div>
                      <div className="table-col actions">
                        <div className="control-buttons inline">
                          <button
                            className="btn btn-ghost btn-xs"
                            onClick={() =>
                              runControl(
                                {
                                  target: "launchAgent",
                                  action:
                                    agent.state === "running" || agent.state === "loaded"
                                      ? "stop"
                                      : "start",
                                  label: agent.label,
                                },
                                `${agent.state === "running" || agent.state === "loaded" ? "stop" : "start"} ${agent.label}`
                              )
                            }
                            disabled={
                              actionKey ===
                              `launchAgent:${agent.state === "running" || agent.state === "loaded" ? "stop" : "start"}:${agent.label}`
                            }
                          >
                            {agent.state === "running" || agent.state === "loaded" ? "Stop" : "Start"}
                          </button>
                          <button
                            className="btn btn-ghost btn-xs"
                            onClick={() =>
                              runControl(
                                { target: "launchAgent", action: "restart", label: agent.label },
                                `restart ${agent.label}`
                              )
                            }
                            disabled={actionKey === `launchAgent:restart:${agent.label}`}
                          >
                            Restart
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="monitor-card">
                <div className="monitor-card-title">
                  <MappedIcon name="tasks" size="sm" />
                  Process Watch
                </div>
                <div className="table-like compact">
                  {snapshot.processes.map((process) => (
                    <div key={process.pattern} className="table-row">
                      <div className="table-col name">
                        <div>{process.name}</div>
                        <small>{process.pattern}</small>
                      </div>
                      <div className="table-col">
                        <HealthPill state={process.running ? "running" : "stopped"} />
                      </div>
                      <div className="table-col mono">{process.count}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="monitor-card">
              <div className="monitor-card-title">
                <MappedIcon name="files" size="sm" />
                Docker Containers
              </div>
              {snapshot.docker.totalContainers === 0 ? (
                <div className="monitor-empty">
                  No containers detected.
                </div>
              ) : (
                <div className="table-like compact">
                  {snapshot.docker.containers.map((container) => (
                    <div key={container.id} className="table-row">
                      <div className="table-col name">
                        <div>{container.name}</div>
                        <small>{container.image}</small>
                      </div>
                      <div className="table-col">{container.status}</div>
                      <div className="table-col mono">{container.ports || "n/a"}</div>
                      <div className="table-col actions">
                        <div className="control-buttons inline">
                          {container.state === "running" ? (
                            <>
                              <button
                                className="btn btn-ghost btn-xs"
                                onClick={() =>
                                  runControl(
                                    {
                                      target: "dockerContainer",
                                      action: "stop",
                                      containerId: container.id,
                                    },
                                    `stop container ${container.name}`
                                  )
                                }
                                disabled={actionKey === `dockerContainer:stop:${container.id}`}
                              >
                                Stop
                              </button>
                              <button
                                className="btn btn-ghost btn-xs"
                                onClick={() =>
                                  runControl(
                                    {
                                      target: "dockerContainer",
                                      action: "restart",
                                      containerId: container.id,
                                    },
                                    `restart container ${container.name}`
                                  )
                                }
                                disabled={actionKey === `dockerContainer:restart:${container.id}`}
                              >
                                Restart
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn btn-ghost btn-xs"
                              onClick={() =>
                                runControl(
                                  {
                                    target: "dockerContainer",
                                    action: "start",
                                    containerId: container.id,
                                  },
                                  `start container ${container.name}`
                                )
                              }
                              disabled={actionKey === `dockerContainer:start:${container.id}`}
                            >
                              Start
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <style jsx>{`
        .monitor-header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .monitor-updated {
          font-size: 12px;
          color: var(--text-dim);
        }
        .monitor-stack {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .monitor-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }
        .monitor-card {
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          background: var(--bg-elevated);
          padding: 14px;
        }
        .monitor-card-title {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 10px;
        }
        .monitor-rows {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 12px;
        }
        .monitor-row {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          font-size: 12px;
          color: var(--text-muted);
        }
        .monitor-row strong {
          color: var(--text-primary);
          font-weight: 500;
          text-align: right;
          word-break: break-word;
        }
        .metric-block {
          margin-top: 8px;
        }
        .metric-label {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          color: var(--text-muted);
          margin-bottom: 6px;
        }
        .metric-label span {
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }
        .metric-bar {
          width: 100%;
          height: 8px;
          border-radius: 999px;
          background: var(--bg-surface);
          overflow: hidden;
          border: 1px solid var(--border-subtle);
        }
        .metric-bar > div {
          height: 100%;
          background: linear-gradient(90deg, var(--accent-primary), var(--accent-cyan));
          transition: width 0.2s ease;
        }
        .metric-footnote {
          margin-top: 4px;
          font-size: 11px;
          color: var(--text-dim);
        }
        .summary-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .control-stack {
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .control-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          font-size: 12px;
          color: var(--text-muted);
        }
        .control-buttons {
          display: inline-flex;
          gap: 6px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .control-buttons.inline {
          justify-content: flex-start;
        }
        .summary-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          font-size: 12px;
          color: var(--text-muted);
        }
        .summary-item strong {
          color: var(--text-primary);
          font-size: 13px;
          font-variant-numeric: tabular-nums;
        }
        .load-row {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          color: var(--text-muted);
        }
        .load-row strong {
          color: var(--text-primary);
          font-family: var(--font-mono);
        }
        .monitor-notice {
          margin-top: 10px;
          font-size: 12px;
          color: var(--state-warning);
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.24);
          border-radius: var(--radius-md);
          padding: 8px 10px;
        }
        .table-like {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .table-like.compact {
          gap: 6px;
        }
        .table-row {
          display: grid;
          grid-template-columns: minmax(0, 2.2fr) minmax(110px, 1fr) minmax(70px, 0.7fr) minmax(
              70px,
              0.7fr
            ) minmax(70px, 0.7fr) minmax(130px, 1fr);
          gap: 8px;
          align-items: center;
          padding: 8px 10px;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          background: var(--bg-surface);
        }
        .table-like.compact .table-row {
          grid-template-columns: minmax(0, 2fr) minmax(110px, 1fr) minmax(70px, 0.7fr) minmax(
              130px,
              1fr
            );
        }
        .table-col {
          font-size: 12px;
          color: var(--text-muted);
        }
        .table-col.actions {
          justify-self: end;
        }
        .table-col.mono {
          font-family: var(--font-mono);
          font-variant-numeric: tabular-nums;
          color: var(--text-secondary);
        }
        .table-col.name div {
          color: var(--text-primary);
          font-weight: 500;
        }
        .table-col.name small {
          display: block;
          margin-top: 2px;
          color: var(--text-dim);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .health-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border-radius: 999px;
          border: 1px solid transparent;
          padding: 3px 9px;
          font-size: 11px;
          font-weight: 600;
        }
        .health-pill.good {
          color: var(--state-success);
          border-color: rgba(34, 197, 94, 0.35);
          background: rgba(34, 197, 94, 0.12);
        }
        .health-pill.warn {
          color: var(--state-warning);
          border-color: rgba(245, 158, 11, 0.35);
          background: rgba(245, 158, 11, 0.12);
        }
        .health-pill.bad {
          color: var(--state-error);
          border-color: rgba(239, 68, 68, 0.35);
          background: rgba(239, 68, 68, 0.12);
        }
        .health-pill.muted {
          color: var(--text-dim);
          border-color: var(--border-subtle);
          background: var(--bg-surface);
        }
        .monitor-empty {
          font-size: 12px;
          color: var(--text-muted);
          padding: 12px;
          border: 1px dashed var(--border-subtle);
          border-radius: var(--radius-md);
          background: var(--bg-surface);
        }
        .monitor-error {
          font-size: 13px;
          color: var(--state-error);
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.24);
          border-radius: var(--radius-md);
          padding: 10px 12px;
        }
        @media (max-width: 1100px) {
          .monitor-grid {
            grid-template-columns: 1fr;
          }
          .table-row {
            grid-template-columns: 1fr;
            gap: 6px;
          }
          .table-like.compact .table-row {
            grid-template-columns: 1fr;
          }
          .table-col.actions {
            justify-self: start;
          }
          .table-col.name small {
            white-space: normal;
            word-break: break-word;
          }
        }
      `}</style>
    </section>
  );
}
