"use client";

import { memo, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Popover, PopoverContent, PopoverTrigger, MappedIcon } from "@/components/ui";
import { toast } from "sonner";

// ─── Types ───

type CronJob = {
  id?: string;
  name?: string;
  cron?: string;
  schedule?: unknown;
  enabled?: boolean;
  state?: {
    lastRunAtMs?: number;
    lastStatus?: string;
    lastDurationMs?: number;
  };
  [key: string]: unknown;
};

type CronRunEntry = {
  ts?: number;
  status?: string;
  runAtMs?: number;
};

// ─── Minimal Cron Parser ───
// Handles: *, */N, N, N-M, comma-separated values
// Fields: minute hour dayOfMonth month dayOfWeek

function parseCronField(field: string, min: number, max: number): number[] {
  const values: Set<number> = new Set();
  for (const part of field.split(",")) {
    const trimmed = part.trim();
    if (trimmed === "*") {
      for (let i = min; i <= max; i++) values.add(i);
    } else if (trimmed.startsWith("*/")) {
      const step = parseInt(trimmed.slice(2), 10);
      if (!isNaN(step) && step > 0) {
        for (let i = min; i <= max; i += step) values.add(i);
      }
    } else if (trimmed.includes("-")) {
      const [a, b] = trimmed.split("-").map(Number);
      if (!isNaN(a) && !isNaN(b)) {
        for (let i = a; i <= b; i++) values.add(i);
      }
    } else {
      const n = parseInt(trimmed, 10);
      if (!isNaN(n)) values.add(n);
    }
  }
  return [...values].sort((a, b) => a - b);
}

type ResolvedSchedule =
  | { kind: "cron"; expr: string; display: string }
  | { kind: "every"; display: string }
  | { kind: "at"; at: Date | null; display: string }
  | { kind: "unknown"; display: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEveryToMinutes(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Heuristic: large numbers are typically milliseconds (or seconds).
    if (value >= 1000) {
      if (value % 60000 === 0) return Math.max(1, Math.round(value / 60000));
      if (value % 1000 === 0) return Math.max(1, Math.round((value / 1000) / 60));
      return Math.max(1, Math.round(value / 60000));
    }
    return Math.max(1, Math.round(value));
  }

  if (typeof value !== "string") return null;
  const input = value.trim();
  if (!input) return null;

  const match = input.match(/^(\d+(?:\.\d+)?)\s*(ms|s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)?$/i);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;

  const unit = (match[2] ?? "m").toLowerCase();
  const minutes =
    unit === "ms"
      ? amount / 60000
      : unit === "s" || unit === "sec" || unit === "secs" || unit === "second" || unit === "seconds"
        ? amount / 60
        : unit === "h" || unit === "hr" || unit === "hrs" || unit === "hour" || unit === "hours"
          ? amount * 60
          : unit === "d" || unit === "day" || unit === "days"
            ? amount * 24 * 60
            : amount;

  return Math.max(1, Math.round(minutes));
}

function parseAtToDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1_000_000_000_000 ? value * 1000 : value; // seconds vs ms
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === "string") {
    const input = value.trim();
    if (!input) return null;
    const asNumber = Number(input);
    if (Number.isFinite(asNumber) && input.match(/^\d+(\.\d+)?$/)) {
      return parseAtToDate(asNumber);
    }
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function resolveSchedule(job: CronJob): ResolvedSchedule | null {
  if (typeof job.cron === "string") return { kind: "cron", expr: job.cron, display: job.cron };

  if (typeof job.schedule === "string") {
    return { kind: "unknown", display: job.schedule };
  }

  if (!isRecord(job.schedule)) return null;

  // Legacy schedule object: { cron: string }
  if (typeof job.schedule.cron === "string") {
    return { kind: "cron", expr: job.schedule.cron, display: job.schedule.cron };
  }

  // New schedule object: { kind: 'cron' | 'every' | 'at', ... }
  const kind = job.schedule.kind;
  if (kind === "cron" && typeof job.schedule.expr === "string") {
    return { kind: "cron", expr: job.schedule.expr, display: job.schedule.expr };
  }

  if (kind === "every") {
    const minutes =
      parseEveryToMinutes(job.schedule.every) ??
      parseEveryToMinutes(job.schedule.minutes) ??
      parseEveryToMinutes(job.schedule.intervalMinutes) ??
      parseEveryToMinutes(job.schedule.intervalMins) ??
      parseEveryToMinutes(job.schedule.intervalMs);

    if (minutes !== null) return { kind: "every", display: `every ${minutes}m` };
    if (typeof job.schedule.every === "string") return { kind: "every", display: `every ${job.schedule.every}` };
    if (typeof job.schedule.every === "number") return { kind: "every", display: `every ${job.schedule.every}` };
    return { kind: "every", display: "every" };
  }

  if (kind === "at") {
    const at =
      parseAtToDate(job.schedule.at) ??
      parseAtToDate(job.schedule.timestamp) ??
      parseAtToDate(job.schedule.time) ??
      parseAtToDate(job.schedule.when);
    return { kind: "at", at, display: at ? `at ${at.toISOString()}` : "at" };
  }

  // Legacy variants sometimes used by other UIs: { every: '5m' } / { at: '...' }
  if (typeof job.schedule.every === "string" || typeof job.schedule.every === "number") {
    const minutes = parseEveryToMinutes(job.schedule.every);
    return { kind: "every", display: minutes !== null ? `every ${minutes}m` : `every ${String(job.schedule.every)}` };
  }
  if (typeof job.schedule.at === "string" || typeof job.schedule.at === "number") {
    const at = parseAtToDate(job.schedule.at);
    return { kind: "at", at, display: at ? `at ${at.toISOString()}` : `at ${String(job.schedule.at)}` };
  }

  return { kind: "unknown", display: null };
}

function getScheduleExpression(job: CronJob): string | null {
  const resolved = resolveSchedule(job);
  return resolved?.display ?? null;
}

function cronMatchesDate(expr: string, date: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return false;

  const [, , domStr, monStr, dowStr] = parts;

  const dayOfMonth = parseCronField(domStr, 1, 31);
  const month = parseCronField(monStr, 1, 12);
  const dayOfWeek = parseCronField(dowStr, 0, 6);

  const d = date.getDate();
  const m = date.getMonth() + 1; // JS months are 0-indexed
  const w = date.getDay(); // 0 = Sunday

  return month.includes(m) && dayOfMonth.includes(d) && dayOfWeek.includes(w);
}

function getJobsForDate(jobs: CronJob[], date: Date): CronJob[] {
  return jobs.filter((job) => {
    if (typeof (job as { enabled?: boolean }).enabled === "boolean" && !job.enabled) return false;
    const schedule = resolveSchedule(job);
    if (!schedule) return false;

    if (schedule.kind === "every") return true;
    if (schedule.kind === "at") return schedule.at ? isSameDay(schedule.at, date) : false;

    const expr = schedule.kind === "cron" ? schedule.expr : schedule.display;
    if (!expr) return false;

    // Skip non-standard expressions like "every 5m"
    const parts = expr.trim().split(/\s+/);
    if (parts.length < 5) return false;
    return cronMatchesDate(expr, date);
  });
}

// ─── Helpers ───

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getCalendarDays(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const cells: (Date | null)[] = [];
  // Leading empty cells
  for (let i = 0; i < startDow; i++) cells.push(null);
  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, month, d));
  }
  // Trailing empty cells to fill last row
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

// Stable colors for job dots
const JOB_COLORS = [
  "var(--accent-primary)",
  "var(--accent-warning)",
  "#a78bfa",
  "#f472b6",
  "#38bdf8",
  "var(--accent-success)",
  "#fb923c",
  "#e879f9",
  "#34d399",
];

function getJobColor(job: CronJob, allJobs: CronJob[]): string {
  const idx = allJobs.indexOf(job);
  return JOB_COLORS[idx % JOB_COLORS.length];
}

function getJobKey(job: CronJob): string | null {
  const key = job.id ?? job.name ?? "";
  return key ? key : null;
}

function isFailureStatus(status: unknown): boolean {
  const s = typeof status === "string" ? status.toLowerCase() : "";
  return s === "error" || s === "failed";
}

function normalizeRunAtMs(entry: CronRunEntry): number | null {
  if (typeof entry.runAtMs === "number" && Number.isFinite(entry.runAtMs)) return entry.runAtMs;
  if (typeof entry.ts === "number" && Number.isFinite(entry.ts)) {
    // Heuristic: treat small values as seconds, large as ms.
    return entry.ts < 1_000_000_000_000 ? entry.ts * 1000 : entry.ts;
  }
  return null;
}

function toDayKey(dateOrMs: Date | number): string {
  const d = typeof dateOrMs === "number" ? new Date(dateOrMs) : dateOrMs;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function eachWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  const queue = items.slice();
  const count = Math.max(1, Math.min(limit, queue.length));
  const runners = Array.from({ length: count }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item === undefined) return;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

// ─── Component ───

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

export const CronCalendar = memo(function CronCalendar() {
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [runsByJobId, setRunsByJobId] = useState<Record<string, CronRunEntry[]>>({});
  const runsLoadedRef = useRef<Set<string>>(new Set());
  const runsInFlightRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch("/api/openclaw/cron/list?all=1", { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (data.ok) {
        setJobs(normalizeJobs(data.data));
      }
    } catch {
      // Silently fail — jobs stays empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const fetchRunsForJob = useCallback(async (jobId: string): Promise<CronRunEntry[]> => {
    const res = await fetch(
      `/api/openclaw/cron/runs?id=${encodeURIComponent(jobId)}&limit=50`,
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

    return entries.map((entry) => ({
      ts: typeof entry.ts === "number" ? entry.ts : undefined,
      status: typeof entry.status === "string" ? entry.status : undefined,
      runAtMs: typeof entry.runAtMs === "number" ? entry.runAtMs : undefined,
    }));
  }, []);

  const refreshRunsForJob = useCallback(async (jobId: string) => {
    if (runsInFlightRef.current.has(jobId)) return;
    runsInFlightRef.current.add(jobId);
    try {
      const entries = await fetchRunsForJob(jobId);
      setRunsByJobId((prev) => ({ ...prev, [jobId]: entries }));
      runsLoadedRef.current.add(jobId);
    } catch {
      // Mark as loaded to avoid background refetch loops.
      setRunsByJobId((prev) => ({ ...prev, [jobId]: prev[jobId] ?? [] }));
      runsLoadedRef.current.add(jobId);
    } finally {
      runsInFlightRef.current.delete(jobId);
    }
  }, [fetchRunsForJob]);

  // Background fetch of run history per job (small concurrency limit).
  useEffect(() => {
    let cancelled = false;
    const jobIds = jobs
      .map(getJobKey)
      .filter((id): id is string => Boolean(id));

    const missing = jobIds.filter((id) =>
      !runsLoadedRef.current.has(id) && !runsInFlightRef.current.has(id)
    );
    if (missing.length === 0) return;

    void (async () => {
      await eachWithConcurrency(missing, 3, async (id) => {
        if (cancelled) return;
        if (runsLoadedRef.current.has(id) || runsInFlightRef.current.has(id)) return;
        runsInFlightRef.current.add(id);
        try {
          const entries = await fetchRunsForJob(id);
          if (cancelled) return;
          setRunsByJobId((prev) => ({ ...prev, [id]: entries }));
          runsLoadedRef.current.add(id);
        } catch {
          if (cancelled) return;
          setRunsByJobId((prev) => ({ ...prev, [id]: [] }));
          runsLoadedRef.current.add(id);
        } finally {
          runsInFlightRef.current.delete(id);
        }
      });
    })();

    return () => { cancelled = true; };
  }, [jobs, fetchRunsForJob]);

  const runSummariesByJobId = useMemo(() => {
    const out: Record<string, Record<string, { runs: number; failures: number; latestRunAtMs: number | null }>> = {};
    for (const [jobId, entries] of Object.entries(runsByJobId)) {
      const byDay: Record<string, { runs: number; failures: number; latestRunAtMs: number | null }> = {};
      for (const entry of entries) {
        const runAtMs = normalizeRunAtMs(entry);
        if (runAtMs === null) continue;
        const dayKey = toDayKey(runAtMs);
        const slot = byDay[dayKey] ?? { runs: 0, failures: 0, latestRunAtMs: null };
        slot.runs += 1;
        if (isFailureStatus(entry.status)) slot.failures += 1;
        if (slot.latestRunAtMs === null || runAtMs > slot.latestRunAtMs) slot.latestRunAtMs = runAtMs;
        byDay[dayKey] = slot;
      }
      out[jobId] = byDay;
    }
    return out;
  }, [runsByJobId]);

  const cells = useMemo(() => getCalendarDays(year, month), [year, month]);

  const prevMonth = useCallback(() => {
    if (month === 0) { setYear(year - 1); setMonth(11); }
    else setMonth(month - 1);
  }, [year, month]);

  const nextMonth = useCallback(() => {
    if (month === 11) { setYear(year + 1); setMonth(0); }
    else setMonth(month + 1);
  }, [year, month]);

  const goToday = useCallback(() => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  }, [today]);

  const runJob = useCallback(async (job: CronJob) => {
    const id = job.id ?? job.name ?? "";
    if (!id) return;
    const label = job.name ?? job.id ?? id;
    setActionLoading(id);
    const toastId = toast.loading(`Running ${label}...`);
    try {
      const res = await fetch("/api/openclaw/cron/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "run" }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? `Action failed (${res.status})`);
      }

      toast.success("Job started", { id: toastId, description: label });
      await load();
      await refreshRunsForJob(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Run failed";
      toast.error("Run failed", { id: toastId, description: message });
    } finally {
      setActionLoading(null);
    }
  }, [load, refreshRunsForJob]);

  return (
    <div className="flex flex-col h-full">
      {/* Calendar Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{MONTHS[month]} {year}</h2>
          <button
            onClick={goToday}
            className="text-xs px-2 py-0.5 rounded-md transition-colors"
            style={{
              color: "var(--accent-primary)",
              background: "var(--accent-soft)",
            }}
          >
            Today
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] transition-colors"
            aria-label="Previous month"
          >
            <MappedIcon name="chevronLeft" size="sm" />
          </button>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] transition-colors"
            aria-label="Next month"
          >
            <MappedIcon name="chevronRight" size="sm" />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading...</div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-3">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-px mb-1">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="text-center text-[10px] font-medium py-1"
                style={{ color: "var(--text-dim)" }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-px">
            {cells.map((date, i) => {
              if (!date) {
                return <div key={`empty-${i}`} className="aspect-square" />;
              }

              const scheduledJobs = getJobsForDate(jobs, date);
              const dayKey = toDayKey(date);
              const jobsWithRuns = jobs.filter((job) => {
                const jobId = getJobKey(job);
                if (!jobId) return false;
                const day = runSummariesByJobId[jobId]?.[dayKey];
                return Boolean(day && day.runs > 0);
              });
              const dayJobs = [
                ...scheduledJobs,
                ...jobsWithRuns.filter((j) => !scheduledJobs.includes(j)),
              ];
              const isToday = isSameDay(date, today);
              const isPast = date < today && !isToday;

              return (
                <Popover key={date.toISOString()}>
                  <PopoverTrigger asChild>
                    <button
                      className="aspect-square rounded-md flex flex-col items-center justify-center gap-0.5 transition-colors relative"
                      style={{
                        background: isToday ? "var(--accent-soft)" : "transparent",
                        opacity: isPast ? 0.5 : 1,
                      }}
                      disabled={dayJobs.length === 0}
                      aria-label={`${MONTHS[month]} ${date.getDate()} — ${dayJobs.length} job${dayJobs.length !== 1 ? "s" : ""}`}
                    >
                      <span
                        className="text-xs font-medium"
                        style={{
                          color: isToday ? "var(--accent-primary)" : "var(--text-primary)",
                        }}
                      >
                        {date.getDate()}
                      </span>
                      {dayJobs.length > 0 && (
                        <div className="flex items-center gap-px">
                          {dayJobs.slice(0, 4).map((job, idx) => (
                            <span
                              key={job.id ?? job.name ?? idx}
                              className="w-1.5 h-1.5 rounded-full"
                              style={{
                                background: getJobColor(job, jobs),
                                outline: (() => {
                                  const jobId = getJobKey(job);
                                  if (!jobId) return undefined;
                                  const hasRunsLoaded = jobId in runsByJobId;
                                  const day = runSummariesByJobId[jobId]?.[dayKey];
                                  if (hasRunsLoaded) {
                                    return day?.failures ? "1px solid rgba(239, 68, 68, 0.9)" : undefined;
                                  }
                                  return job.state?.lastStatus && isFailureStatus(job.state.lastStatus)
                                    ? "1px solid rgba(239, 68, 68, 0.9)"
                                    : undefined;
                                })(),
                                outlineOffset: 1,
                              }}
                              title={job.state?.lastStatus ? `Last: ${job.state.lastStatus}` : undefined}
                            />
                          ))}
                          {dayJobs.length > 4 && (
                            <span className="text-[8px]" style={{ color: "var(--text-dim)" }}>
                              +{dayJobs.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  </PopoverTrigger>
                  {dayJobs.length > 0 && (
                    <PopoverContent className="w-64 p-0" align="center">
                      <div className="px-3 py-2 border-b border-[var(--border-subtle)]">
                        <div className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                          {MONTHS[month]} {date.getDate()}, {year}
                        </div>
                        <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                          {dayJobs.length} job{dayJobs.length !== 1 ? "s" : ""} (scheduled or ran)
                        </div>
                      </div>
                      <div className="p-2 space-y-1 max-h-48 overflow-auto">
                        {dayJobs.map((job, idx) => {
                          const jobId = job.id ?? job.name ?? String(idx);
                          const isRunning = actionLoading === jobId;
                          const hasRunsLoaded = jobId in runsByJobId;
                          const day = runSummariesByJobId[jobId]?.[dayKey];
                          const runsLabel = isToday ? "today" : "that day";
                          return (
                            <div
                              key={jobId}
                              className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md"
                              style={{ background: "var(--bg-elevated)" }}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ background: getJobColor(job, jobs) }}
                                />
                                <div className="min-w-0">
                                  <div className="text-xs font-medium truncate">
                                    {job.name ?? job.id ?? "Unnamed"}
                                  </div>
                                  <div className="text-[10px] font-mono" style={{ color: "var(--text-dim)" }}>
                                    {getScheduleExpression(job) ?? "—"}
                                  </div>
                                  <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                                    Runs {runsLabel}: {!hasRunsLoaded
                                      ? "loading..."
                                      : day?.runs
                                        ? `${day.runs} · ${day.runs - day.failures} ok · ${day.failures} failed`
                                        : "none"}
                                  </div>
                                  <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                                    Last: {job.state?.lastRunAtMs ? new Date(job.state.lastRunAtMs).toLocaleString() : "—"}
                                    {job.state?.lastStatus ? ` · ${job.state.lastStatus}` : ""}
                                  </div>
                                </div>
                              </div>
                              <button
                                className="text-[10px] px-2 py-0.5 rounded flex-shrink-0 transition-colors"
                                style={{
                                  color: "var(--accent-primary)",
                                  background: "var(--accent-soft)",
                                }}
                                onClick={() => runJob(job)}
                                disabled={isRunning}
                              >
                                {isRunning ? "..." : "Run Now"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  )}
                </Popover>
              );
            })}
          </div>

          {/* Legend */}
          {jobs.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
              <div className="flex flex-wrap gap-3">
                {jobs.filter(j => j.enabled !== false).map((job, idx) => {
                  const status = (job.state?.lastStatus ?? "").toLowerCase();
                  const isErr = status === "error" || status === "failed";
                  return (
                    <div key={job.id ?? job.name ?? idx} className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{
                          background: getJobColor(job, jobs),
                          outline: isErr ? "1px solid rgba(239, 68, 68, 0.9)" : undefined,
                          outlineOffset: 1,
                        }}
                      />
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {job.name ?? job.id ?? "Unnamed"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
