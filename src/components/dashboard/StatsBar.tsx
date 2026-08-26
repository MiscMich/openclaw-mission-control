"use client";

import { memo, useMemo, useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/convexApi";
import { KineticNumber, MappedIcon, StatCardSkeleton, type MappedIconName } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useSessionsStream } from "@/hooks/useSessionsStream";
import { canonicalAgentId } from "@/lib/agents/identity";
import { isCompletedTaskStatus } from "@/lib/tasks/status";
import { toast } from "sonner";

// =============================================================================
// TYPES
// =============================================================================

interface StatCardProps {
  icon: MappedIconName;
  label: string;
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  accent?: string;
  delta?: number; // Change from previous period
  showDot?: boolean;
  dotAnimated?: boolean;
  className?: string;
  onClick?: () => void;
  title?: string;
}

const ACTIVE_AGENT_STALE_MS = 2 * 60 * 1000;
const USAGE_SYNC_STALE_MS = 90 * 1000;

function formatAgeLabel(ageMs: number): string {
  if (ageMs < 1000) return "just now";
  if (ageMs < 60_000) return `${Math.floor(ageMs / 1000)}s`;
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m`;
  return `${Math.floor(ageMs / 3_600_000)}h`;
}

// =============================================================================
// COMPACT STAT CARD WITH GRADIENT
// =============================================================================

const StatCard = memo(function StatCard({
  icon,
  label,
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  accent,
  delta,
  showDot = false,
  dotAnimated = false,
  className,
  onClick,
  title,
}: StatCardProps) {
  const hasPositiveDelta = delta !== undefined && delta > 0;
  const hasNegativeDelta = delta !== undefined && delta < 0;

  const content = (
    <>
      {/* Icon + Dot indicator */}
      <div className="flex items-center gap-2 mb-0.5">
        <MappedIcon name={icon} size="xs" className="text-[var(--text-muted)] flex-shrink-0" />
        {showDot && (
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full flex-shrink-0",
              dotAnimated && "animate-pulse"
            )}
            style={{ background: accent || "var(--accent-primary)" }}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Label */}
      <div className="text-xs font-medium text-[var(--text-dim)] uppercase tracking-wider leading-none">
        {label}
      </div>

      {/* Value + Delta */}
      <div className="flex items-baseline gap-2">
        <span
          className="font-mono text-2xl font-bold leading-none tabular-nums"
          style={accent ? { color: accent } : { color: "var(--text-primary)" }}
        >
          <KineticNumber
            value={value}
            decimals={decimals}
            prefix={prefix}
            suffix={suffix}
          />
        </span>

        {/* Optional delta/trend */}
        {delta !== undefined && delta !== 0 && (
          <span
            className={cn(
              "text-xs font-semibold leading-none",
              hasPositiveDelta && "text-[var(--accent-success)]",
              hasNegativeDelta && "text-[var(--accent-error)]"
            )}
          >
            {hasPositiveDelta ? "↑" : "↓"} {Math.abs(delta)}
          </span>
        )}
      </div>
    </>
  );

  const containerClassName = cn(
    "relative flex flex-col justify-center gap-1 px-4 py-3",
    "h-full min-h-[78px] min-w-0 w-full",
    "bg-gradient-to-br from-white/[0.02] to-transparent rounded-lg",
    "border border-[var(--border-subtle)]",
    "transition-all duration-150",
    "hover:border-[var(--border-default)]",
    onClick && "cursor-pointer text-left",
    className
  );

  if (onClick) {
    return (
      <motion.button
        type="button"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        className={cn(
          containerClassName,
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        )}
        onClick={onClick}
        title={title}
        aria-label={title ?? label}
      >
        {content}
      </motion.button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      className={containerClassName}
      title={title}
    >
      {content}
    </motion.div>
  );
});

// =============================================================================
// SKELETON
// =============================================================================

const StatsSkeleton = memo(function StatsSkeleton() {
  return (
    <div
      className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-8"
      aria-busy="true"
      aria-label="Loading statistics"
    >
      <StatCardSkeleton count={8} />
    </div>
  );
});

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const StatsBar = memo(function StatsBar() {
  const tasksResult = useQuery(api.tasks.list, {});
  const agents = useQuery(api.agents.list, {});
  const { sessions, streamConnected, isStale: sessionsStale } = useSessionsStream();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tasks = tasksResult?.tasks;
  const [syncing, setSyncing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 5000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const handleSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    const toastId = toast.loading("Syncing agent status...");
    try {
      const res = await fetch("/api/agents/sync", { method: "POST" });
      const payload = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string; agentsUpdated?: number; sessionsCount?: number }
        | null;

      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || `Sync failed (${res.status})`);
      }

      const details = [
        typeof payload.sessionsCount === "number" ? `${payload.sessionsCount} sessions` : null,
        typeof payload.agentsUpdated === "number" ? `${payload.agentsUpdated} agents updated` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      toast.success("Sync complete", {
        id: toastId,
        ...(details ? { description: details } : {}),
      });
    } catch (error) {
      toast.error("Sync failed", {
        id: toastId,
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  const stats = useMemo(() => {
    // Allow partial rendering - calculate stats with whatever data is available
    const taskStats = tasks ? {
      openTasks: tasks.filter((t) => t.status === "open" || t.status === "inbox").length,
      inProgress: tasks.filter((t) => t.status === "in_progress").length,
      review: tasks.filter((t) => t.status === "review").length,
      completedToday: (() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return tasks.filter((t) => {
          if (!isCompletedTaskStatus(t.status)) return false;
          // Validate timestamp exists before comparison
          if (!t.updatedAt) return false;
          const updatedDate = new Date(t.updatedAt);
          return updatedDate >= today;
        }).length;
      })(),
      avgTaskTime: (() => {
        const completedTasks = tasks.filter((t) => isCompletedTaskStatus(t.status));
        if (completedTasks.length === 0) return 0;
        const totalTime = completedTasks.reduce((sum, task) => {
          // Validate timestamps exist and are positive
          const duration = (task.updatedAt ?? 0) - (task.createdAt ?? 0);
          return sum + (duration > 0 ? duration : 0);
        }, 0);
        return Math.round(totalTime / completedTasks.length / 1000 / 60); // Convert to minutes
      })(),
      costTodayFallback: (() => {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const startMs = startOfToday.getTime();
        return tasks.reduce((sum, task) => {
          if (!task.updatedAt || task.updatedAt < startMs) return sum;
          return sum + (task.costUsd ?? 0);
        }, 0);
      })(),
    } : {
      openTasks: 0,
      inProgress: 0,
      review: 0,
      completedToday: 0,
      avgTaskTime: 0,
      costTodayFallback: 0,
    };

    const agentStats = agents ? {
      workingAgents: (() => {
        const canTrustSessions = streamConnected && !sessionsStale;
        if (canTrustSessions) {
          const sessionWorking = new Set<string>();
          for (const session of sessions) {
            const agentId = session.agentId;
            if (!agentId) continue;
            const status = session.status ?? "running";
            if (status === "running" || status === "active") {
              sessionWorking.add(canonicalAgentId(agentId));
            }
          }
          return agents.filter((agent) =>
            sessionWorking.has(canonicalAgentId(agent.id))
          ).length;
        }

        return agents.filter((a) => {
          if (a.status !== "working") return false;
          if (!a.lastSeen) return true;
          return now - a.lastSeen <= ACTIVE_AGENT_STALE_MS;
        }).length;
      })(),
      totalAgents: agents.length,
      costToday: (() => {
        const syncedToday = agents.reduce((sum, agent) => {
          return sum + (typeof agent.todayCost === "number" ? agent.todayCost : 0);
        }, 0);
        return syncedToday > 0 ? syncedToday : taskStats.costTodayFallback;
      })(),
      latestUsageSyncAt: agents.reduce((latest, agent) => {
        const syncedAt =
          typeof agent.usageSyncedAt === "number" ? agent.usageSyncedAt : 0;
        return Math.max(latest, syncedAt);
      }, 0),
    } : {
      workingAgents: 0,
      totalAgents: 0,
      costToday: taskStats.costTodayFallback,
      latestUsageSyncAt: 0,
    };

    return {
      ...taskStats,
      ...agentStats,
      usageSyncAgeMs:
        agentStats.latestUsageSyncAt > 0 ? now - agentStats.latestUsageSyncAt : null,
    };
  }, [tasks, agents, now, sessions, streamConnected, sessionsStale]);

  // Only show skeleton if BOTH queries are still loading
  if (tasks === undefined && agents === undefined) return <StatsSkeleton />;

  const handleReviewClick = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "tasks");
    params.set("tasksFilter", "review");
    router.push(`?${params.toString()}`, { scroll: false });
  };

  return (
    <section
      className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-[repeat(7,minmax(0,1fr))_auto]"
      aria-label="Dashboard statistics"
    >
      {/* 1. Open Tasks */}
      <StatCard
        icon="tasks"
        label="Open"
        value={stats.openTasks}
        accent="var(--text-primary)"
      />

      {/* 2. In Progress */}
      <StatCard
        icon="lightning"
        label="In Progress"
        value={stats.inProgress}
        accent="var(--accent-primary)"
        showDot={stats.inProgress > 0}
        dotAnimated={stats.inProgress > 0}
      />

      {/* 3. Review */}
      <StatCard
        icon="comment"
        label="Review"
        value={stats.review}
        accent="#7c3aed"
        showDot={stats.review > 0}
        dotAnimated={stats.review > 0}
        onClick={handleReviewClick}
        title="View tasks needing approval"
      />

      {/* 4. Completed Today */}
      <StatCard
        icon="check"
        label="Done Today"
        value={stats.completedToday}
        accent="var(--accent-success)"
        delta={stats.completedToday > 0 ? stats.completedToday : undefined}
      />

      {/* 5. Working Agents */}
      <StatCard
        icon="robot"
        label="Working"
        value={stats.workingAgents}
        accent="var(--accent-primary)"
        showDot={stats.workingAgents > 0}
        dotAnimated={stats.workingAgents > 0}
      />

      {/* 6. Total Cost Today */}
      <StatCard
        icon="cost"
        label="Cost Today"
        value={stats.costToday}
        prefix="$"
        decimals={2}
      />

      {/* 7. Average Task Time */}
      <StatCard
        icon="clock"
        label="Avg Time"
        value={stats.avgTaskTime}
        suffix="m"
        decimals={0}
      />

      {/* Sync Button */}
      <div className="flex h-full min-h-[78px] flex-col items-center justify-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] px-2">
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={handleSync}
          disabled={syncing}
          className={cn(
            "flex items-center justify-center",
            "w-8 h-8 rounded-lg flex-shrink-0",
            "border border-[var(--border-subtle)]",
            "bg-transparent",
            "text-[var(--text-muted)]",
            "transition-all duration-150",
            "hover:border-[var(--border-default)] hover:text-[var(--text-secondary)]",
            "disabled:opacity-50"
          )}
          title="Sync agent status"
          aria-label="Sync agent status"
        >
          <MappedIcon
            name="refresh"
            size="xs"
            className={syncing ? "animate-spin" : ""}
          />
        </motion.button>
        <span
          className="text-[10px] whitespace-nowrap"
          style={{
            color:
              stats.usageSyncAgeMs !== null && stats.usageSyncAgeMs <= USAGE_SYNC_STALE_MS
                ? "var(--text-dim)"
                : "var(--accent-warning)",
          }}
        >
          {stats.usageSyncAgeMs === null
            ? "sync pending"
            : stats.usageSyncAgeMs < 1000
              ? "synced just now"
              : `synced ${formatAgeLabel(stats.usageSyncAgeMs)} ago`}
        </span>
      </div>
    </section>
  );
});

export default StatsBar;
