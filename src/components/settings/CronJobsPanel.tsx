"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { TimeAgo } from "@/components/ui/TimeAgo";
import { GlassPanel } from "@/components/ui/GlassPanel";
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  MappedIcon,
} from "@/components/ui";
import { toast } from "sonner";

type CronJob = {
  id?: string;
  name?: string;
  cron?: string;
  schedule?: string;
  enabled?: boolean;
  nextRunAt?: number | string;
  agentId?: string;
  state?: {
    enabled?: boolean;
    nextRunAt?: number | string;
    nextRunAtMs?: number;
    nextRunAtISO?: string;
    lastRunAtMs?: number;
    lastStatus?: string;
    lastDurationMs?: number;
  };
  [key: string]: unknown;
};

function normalizeJobs(data: unknown): CronJob[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as CronJob[];
  if (typeof data === "object" && data !== null) {
    const obj = data as { jobs?: unknown; items?: unknown; data?: unknown };
    if (Array.isArray(obj.jobs)) return obj.jobs as CronJob[];
    if (Array.isArray(obj.items)) return obj.items as CronJob[];
    if (Array.isArray(obj.data)) return obj.data as CronJob[];
  }
  return [];
}

function formatSchedule(job: CronJob) {
  if (typeof job.cron === "string") return job.cron;
  if (typeof job.schedule === "string") return job.schedule;
  if (typeof job.schedule === "object" && job.schedule !== null) {
    const schedule = job.schedule as { cron?: string; every?: string; at?: string };
    if (schedule.cron) return schedule.cron;
    if (schedule.every) return `every ${schedule.every}`;
    if (schedule.at) return `at ${schedule.at}`;
  }
  return "—";
}

function resolveEnabled(job: CronJob) {
  if (typeof job.enabled === "boolean") return job.enabled;
  const state = (job as { state?: { enabled?: boolean } }).state;
  if (typeof state?.enabled === "boolean") return state.enabled;
  return true;
}

function resolveNextRun(job: CronJob): number | string | null {
  const state = (job as { state?: { nextRunAt?: number; nextRunAtMs?: number; nextRunAtISO?: string } }).state;
  return (
    job.nextRunAt ??
    state?.nextRunAt ??
    state?.nextRunAtMs ??
    state?.nextRunAtISO ??
    null
  );
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function getLastStatus(job: CronJob): string | null {
  const status =
    typeof job.state?.lastStatus === "string"
      ? job.state.lastStatus
      : typeof (job as { lastStatus?: unknown }).lastStatus === "string"
        ? String((job as { lastStatus?: unknown }).lastStatus)
        : null;

  if (!status) return null;
  return status.trim().toLowerCase();
}

export function CronJobsPanel() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const removeCloseLockRef = useRef(false);
  const [removeTarget, setRemoveTarget] = useState<CronJob | null>(null);

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [enabledFilter, setEnabledFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [healthFilter, setHealthFilter] = useState<"all" | "ok" | "error">("all");

  const [runsTarget, setRunsTarget] = useState<CronJob | null>(null);
  const [runsEntries, setRunsEntries] = useState<
    Array<{
      ts?: number;
      action?: string;
      status?: string;
      summary?: string;
      runAtMs?: number;
      durationMs?: number;
      nextRunAtMs?: number;
    }>
  >([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);

  const summary = useMemo(() => {
    let enabled = 0;
    let disabled = 0;
    let ok = 0;
    let err = 0;
    let unknown = 0;

    for (const job of jobs) {
      const isEnabled = resolveEnabled(job);
      if (isEnabled) enabled++;
      else disabled++;

      const last = getLastStatus(job);
      if (!last) unknown++;
      else if (last === "ok" || last === "success") ok++;
      else if (last === "error" || last === "failed") err++;
      else unknown++;
    }

    return {
      total: jobs.length,
      enabled,
      disabled,
      ok,
      err,
      unknown,
    };
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const q = normalizeText(deferredQuery);
    return jobs.filter((job) => {
      const isEnabled = resolveEnabled(job);
      if (enabledFilter === "enabled" && !isEnabled) return false;
      if (enabledFilter === "disabled" && isEnabled) return false;

      const last = getLastStatus(job);
      const isOk = last === "ok" || last === "success";
      const isErr = last === "error" || last === "failed";
      if (healthFilter === "ok" && !isOk) return false;
      if (healthFilter === "error" && !isErr) return false;

      if (!q) return true;
      const label = `${job.name ?? ""} ${job.id ?? ""} ${formatSchedule(job)}`;
      return normalizeText(label).includes(q);
    });
  }, [jobs, deferredQuery, enabledFilter, healthFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Add timeout to prevent infinite loading
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const [listRes, statusRes] = await Promise.all([
        fetch("/api/openclaw/cron/list?all=1", { signal: controller.signal }),
        fetch("/api/openclaw/cron/status", { signal: controller.signal }),
      ]);
      clearTimeout(timeoutId);

      const listData = await listRes.json();
      const statusData = await statusRes.json();

      if (!listData.ok) throw new Error(listData.error ?? "Failed to load scheduled jobs");
      setJobs(normalizeJobs(listData.data));

      if (statusData.ok) {
        const raw = statusData.data;
        const label =
          typeof raw === "string"
            ? raw
            : typeof raw?.status === "string"
              ? raw.status
              : "active";
        setStatus(label);
      } else {
        setStatus(null);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("Request timed out. The backend may be offline.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load scheduled jobs");
      }
      setJobs([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openRuns = useCallback(async (job: CronJob) => {
    const id = job.id ?? job.name ?? "";
    if (!id) return;

    setRunsTarget(job);
    setRunsEntries([]);
    setRunsError(null);
    setRunsLoading(true);

    try {
      const res = await fetch(
        `/api/openclaw/cron/runs?id=${encodeURIComponent(id)}&limit=50`,
        { cache: "no-store" }
      );
      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; data?: unknown; error?: string }
        | null;

      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || `Failed to load runs (${res.status})`);
      }

      const entries =
        payload.data &&
        typeof payload.data === "object" &&
        payload.data !== null &&
        Array.isArray((payload.data as { entries?: unknown }).entries)
          ? ((payload.data as { entries: unknown[] }).entries
              .filter((item): item is Record<string, unknown> =>
                Boolean(item && typeof item === "object")
              ) as Array<Record<string, unknown>>)
          : [];

      setRunsEntries(
        entries.map((entry) => ({
          ts: typeof entry.ts === "number" ? entry.ts : undefined,
          action: typeof entry.action === "string" ? entry.action : undefined,
          status: typeof entry.status === "string" ? entry.status : undefined,
          summary: typeof entry.summary === "string" ? entry.summary : undefined,
          runAtMs: typeof entry.runAtMs === "number" ? entry.runAtMs : undefined,
          durationMs: typeof entry.durationMs === "number" ? entry.durationMs : undefined,
          nextRunAtMs: typeof entry.nextRunAtMs === "number" ? entry.nextRunAtMs : undefined,
        }))
      );
    } catch (err) {
      setRunsError(err instanceof Error ? err.message : "Failed to load run history");
    } finally {
      setRunsLoading(false);
    }
  }, []);

  const action = async (job: CronJob, act: string): Promise<boolean> => {
    if (!job.id && !job.name) return false;
    const id = job.id ?? job.name ?? "";
    setActionLoading(id);
    setError(null);
    const label = job.name ?? job.id ?? id;
    const toastId = toast.loading(
      act === "run"
        ? `Running ${label}...`
        : act === "enable"
          ? `Enabling ${label}...`
          : act === "disable"
            ? `Disabling ${label}...`
            : act === "remove"
              ? `Removing ${label}...`
              : `Updating ${label}...`
    );
    try {
      const res = await fetch("/api/openclaw/cron/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: act }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? `Action failed (${res.status})`);
      }

      toast.success(
        act === "run"
          ? "Job started"
          : act === "enable"
            ? "Job enabled"
            : act === "disable"
              ? "Job disabled"
              : act === "remove"
                ? "Job removed"
                : "Job updated",
        { id: toastId, description: label }
      );

      await load();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed";
      setError(message);
      toast.error(
        act === "run"
          ? "Run failed"
          : act === "remove"
            ? "Remove failed"
            : "Action failed",
        { id: toastId, description: message }
      );
      return false;
    } finally {
      setActionLoading(null);
    }
  };

  const removeId = removeTarget?.id ?? removeTarget?.name ?? "";
  const removing = Boolean(removeId && actionLoading === removeId);

  return (
    <GlassPanel padding="none">
      <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: "rgba(139, 92, 246, 0.12)",
                border: "1px solid rgba(139, 92, 246, 0.22)",
              }}
            >
              <MappedIcon name="clock" size="sm" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-tight">Scheduled jobs</h2>
              <div className="text-xs mt-0.5 flex flex-wrap items-center gap-2" style={{ color: "var(--text-dim)" }}>
                <span>
                  {summary.total} job{summary.total === 1 ? "" : "s"}
                </span>
                <span>·</span>
                <span style={{ color: "var(--accent-success)" }}>{summary.enabled} enabled</span>
                {summary.disabled > 0 && (
                  <>
                    <span>·</span>
                    <span style={{ color: "var(--text-muted)" }}>{summary.disabled} disabled</span>
                  </>
                )}
                {summary.err > 0 && (
                  <>
                    <span>·</span>
                    <span style={{ color: "var(--accent-error)" }}>{summary.err} failing</span>
                  </>
                )}
              </div>
            </div>
          </div>
          {status && (
            <div className="text-xs mt-2" style={{ color: "var(--text-dim)" }}>
              Scheduler:{" "}
              <span style={{ color: status === "active" ? "var(--accent-success)" : "var(--text-muted)" }}>
                {status}
              </span>
            </div>
          )}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          {loading ? "..." : "Refresh"}
        </button>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="relative">
                <input
                  className="input text-sm pr-24"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search scheduled jobs..."
                  aria-label="Search scheduled jobs"
                />
                {query.trim().length > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    title="Clear"
                    style={{
                      position: "absolute",
                      right: 6,
                      top: "50%",
                      transform: "translateY(-50%)",
                      padding: "4px 8px",
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                className={`btn btn-sm ${enabledFilter === "all" ? "btn-secondary" : "btn-ghost"}`}
                onClick={() => setEnabledFilter("all")}
                aria-pressed={enabledFilter === "all"}
              >
                All
              </button>
              <button
                className={`btn btn-sm ${enabledFilter === "enabled" ? "btn-secondary" : "btn-ghost"}`}
                onClick={() => setEnabledFilter("enabled")}
                aria-pressed={enabledFilter === "enabled"}
              >
                Enabled
              </button>
              <button
                className={`btn btn-sm ${enabledFilter === "disabled" ? "btn-secondary" : "btn-ghost"}`}
                onClick={() => setEnabledFilter("disabled")}
                aria-pressed={enabledFilter === "disabled"}
              >
                Disabled
              </button>

              <span className="mx-1 w-px h-6" style={{ background: "var(--border-subtle)" }} />

              <button
                className={`btn btn-sm ${healthFilter === "all" ? "btn-secondary" : "btn-ghost"}`}
                onClick={() => setHealthFilter("all")}
                aria-pressed={healthFilter === "all"}
              >
                Any
              </button>
              <button
                className={`btn btn-sm ${healthFilter === "ok" ? "btn-secondary" : "btn-ghost"}`}
                onClick={() => setHealthFilter("ok")}
                aria-pressed={healthFilter === "ok"}
              >
                Passing
              </button>
              <button
                className={`btn btn-sm ${healthFilter === "error" ? "btn-secondary" : "btn-ghost"}`}
                onClick={() => setHealthFilter("error")}
                aria-pressed={healthFilter === "error"}
                style={{ color: healthFilter === "error" ? "var(--accent-error)" : undefined }}
              >
                Failing
              </button>
            </div>
          </div>

          {!loading && !error && jobs.length > 0 && filteredJobs.length !== jobs.length && (
            <div className="text-xs" style={{ color: "var(--text-dim)" }}>
              Showing {filteredJobs.length} of {jobs.length}
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-lg" style={{ opacity: 1 - i * 0.2 }} />
            ))}
          </div>
        ) : error ? (
          <div
            className="text-sm px-4 py-3 rounded-lg"
            style={{
              color: "var(--accent-error)",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
          >
            {error}
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>
              No scheduled jobs yet
            </div>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>
              No jobs match your filters.
            </div>
            <button
              className="btn btn-ghost btn-sm mt-3"
              onClick={() => {
                setQuery("");
                setEnabledFilter("all");
                setHealthFilter("all");
              }}
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredJobs.map((job, idx) => {
              const enabled = resolveEnabled(job);
              const nextRun = resolveNextRun(job);
              const jobId = job.id ?? job.name ?? String(idx);
              const isLoading = actionLoading === jobId;
              const last = getLastStatus(job);
              const lastIsOk = last === "ok" || last === "success";
              const lastIsErr = last === "error" || last === "failed";

              return (
                <div
                  key={jobId}
                  className="p-3 rounded-lg transition-colors"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-subtle)",
                    opacity: enabled ? 1 : 0.6,
                    contentVisibility: "auto",
                    containIntrinsicSize: "80px",
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{
                            background: enabled ? "var(--accent-success)" : "var(--text-dim)",
                          }}
                        />
                        <span className="text-sm font-medium truncate">
                          {job.name ?? job.id ?? "Unnamed job"}
                        </span>
                        {last && (
                          <span
                            className="px-1.5 py-0.5 rounded-md text-[10px] uppercase font-semibold tracking-wider"
                            style={{
                              background: lastIsOk
                                ? "rgba(34, 197, 94, 0.15)"
                                : lastIsErr
                                  ? "rgba(239, 68, 68, 0.15)"
                                  : "rgba(148, 163, 184, 0.15)",
                              color: lastIsOk
                                ? "var(--accent-success)"
                                : lastIsErr
                                  ? "var(--accent-error)"
                                  : "var(--text-muted)",
                            }}
                          >
                            {last}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
                        <span className="font-mono">{formatSchedule(job)}</span>
                        {nextRun && (
                          <>
                            <span>•</span>
                            <span>
                              Next: <TimeAgo timestamp={typeof nextRun === "string" ? Date.parse(nextRun) : nextRun} />
                            </span>
                          </>
                        )}
                        {job.state?.lastRunAtMs && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-2">
                              <span>
                                Last: <TimeAgo timestamp={job.state.lastRunAtMs} />
                              </span>
                              {typeof job.state.lastDurationMs === "number" && (
                                <span>
                                  {(job.state.lastDurationMs / 1000).toFixed(1)}s
                                </span>
                              )}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => action(job, enabled ? "disable" : "enable")}
                        disabled={isLoading}
                        style={{ minWidth: 70 }}
                      >
                        {enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => action(job, "run")}
                        disabled={isLoading}
                      >
                        Run
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => void openRuns(job)}
                        disabled={isLoading}
                      >
                        History
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setRemoveTarget(job)}
                        disabled={isLoading}
                        style={{ color: "var(--accent-error)" }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(runsTarget)}
        onOpenChange={(open) => {
          if (open) return;
          setRunsTarget(null);
          setRunsEntries([]);
          setRunsError(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Run history</DialogTitle>
            <div className="text-xs" style={{ color: "var(--text-dim)" }}>
              {runsTarget?.name ?? runsTarget?.id ?? "job"}
            </div>
          </DialogHeader>

          {runsLoading ? (
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>
              Loading…
            </div>
          ) : runsError ? (
            <div
              className="text-sm px-4 py-3 rounded-lg"
              style={{
                color: "var(--accent-error)",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
              }}
            >
              {runsError}
            </div>
          ) : runsEntries.length === 0 ? (
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>
              No runs recorded yet.
            </div>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {runsEntries.map((entry, idx) => {
                const key = `${entry.ts ?? "ts"}-${idx}`;
                const status = (entry.status ?? "").toLowerCase();
                const isOk = status === "ok";
                const isErr = status === "error" || status === "failed";

                return (
                  <div
                    key={key}
                    className="rounded-lg p-3"
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="px-2 py-0.5 rounded-md text-[10px] uppercase font-semibold tracking-wider"
                          style={{
                            background: isOk
                              ? "rgba(34, 197, 94, 0.15)"
                              : isErr
                                ? "rgba(239, 68, 68, 0.15)"
                                : "rgba(148, 163, 184, 0.15)",
                            color: isOk
                              ? "var(--accent-success)"
                              : isErr
                                ? "var(--accent-error)"
                                : "var(--text-muted)",
                          }}
                        >
                          {entry.status ?? "unknown"}
                        </span>
                        {typeof entry.runAtMs === "number" && (
                          <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                            <TimeAgo timestamp={entry.runAtMs} />
                          </span>
                        )}
                        {typeof entry.durationMs === "number" && (
                          <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                            · {(entry.durationMs / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>

                      {typeof entry.nextRunAtMs === "number" && (
                        <div className="text-xs" style={{ color: "var(--text-dim)" }}>
                          Next: <TimeAgo timestamp={entry.nextRunAtMs} />
                        </div>
                      )}
                    </div>

                    {entry.summary && (
                      <pre
                        className="mt-2 text-xs whitespace-pre-wrap"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {entry.summary}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => {
          if (removeCloseLockRef.current) return;
          if (!open) setRemoveTarget(null);
        }}
        title="Remove scheduled job?"
        description={
          removeTarget ? (
            <>
              Remove <strong>{removeTarget.name ?? removeTarget.id ?? "job"}</strong>? This action cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Remove"
        confirmVariant="danger"
        confirmLoading={removing}
        confirmDisabled={!removeTarget}
        onConfirm={() => {
          if (!removeTarget) return;
          removeCloseLockRef.current = true;
          void action(removeTarget, "remove").then((ok) => {
            removeCloseLockRef.current = false;
            if (ok) {
              setRemoveTarget(null);
            }
          });
        }}
      />
    </GlassPanel>
  );
}
