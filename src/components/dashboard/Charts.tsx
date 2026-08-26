"use client";

import { memo, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convexApi";
import { GlassPanel, KineticNumber, MappedIcon } from "@/components/ui";
import { isCompletedTaskStatus } from "@/lib/tasks/status";

type Agent = {
  id: string;
  name: string;
  emoji: string;
  status: string;
  totalCost: number;
  totalTokens?: number;
};

type Task = {
  id: string;
  status: string;
  createdAt: number;
  completedAt?: number;
};

type Activity = {
  id: string;
  agentId?: string;
  createdAt: number;
};

// Simple bar for cost visualization (memoized)
const CostBar = memo(function CostBar({ value, max, label }: { value: number; max: number; label: string }) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;

  return (
    <div className="flex items-center gap-3">
      <div className="w-20 text-xs text-right truncate" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="flex-1 h-6 rounded-lg overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
        <div
          className="h-full rounded-lg transition-[width] duration-500 ease-out"
          style={{
            width: `${percentage}%`,
            background: "linear-gradient(90deg, var(--accent-primary), var(--accent-success))",
          }}
        />
      </div>
      <div className="w-16 text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
        ${value.toFixed(2)}
      </div>
    </div>
  );
});

// Agent activity heatmap cell (memoized)
const HeatmapCell = memo(function HeatmapCell({ value, max }: { value: number; max: number }) {
  const intensity = max > 0 ? value / max : 0;
  const opacity = 0.1 + intensity * 0.9;

  return (
    <div
      className="w-3.5 h-3.5 rounded-sm transition-opacity duration-200"
      style={{
        background: `rgba(16, 163, 127, ${opacity})`,
        border: intensity > 0 ? "1px solid rgba(16, 163, 127, 0.3)" : "1px solid var(--border-subtle)",
      }}
      title={`${value} activities`}
    />
  );
});

// Task completion donut (memoized)
const CompletionRing = memo(function CompletionRing({ completed, total }: { completed: number; total: number }) {
  const percentage = total > 0 ? (completed / total) * 100 : 0;
  const circumference = 2 * Math.PI * 45; // radius = 45
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
        {/* Background circle */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="var(--bg-elevated)"
          strokeWidth="8"
        />
        {/* Progress circle */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="var(--accent-primary)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold">{Math.round(percentage)}%</span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>complete</span>
      </div>
    </div>
  );
});

export const CostChart = memo(function CostChart() {
  const agents = useQuery(api.agents.list, {}) as Agent[] | undefined;

  const { sortedAgents, maxCost } = useMemo(() => {
    if (!agents) return { sortedAgents: [], maxCost: 0 };
    const sorted = [...agents].sort((a, b) => (b.totalCost || 0) - (a.totalCost || 0));
    const max = Math.max(...agents.map((a) => a.totalCost || 0), 0.01);
    return { sortedAgents: sorted, maxCost: max };
  }, [agents]);

  const totalCost = agents?.reduce((sum, a) => sum + (a.totalCost || 0), 0) ?? 0;

  if (!agents) {
    return (
      <GlassPanel padding="lg">
        <div className="space-y-3">
          <div className="skeleton h-6 w-32 rounded" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton h-6 rounded" />
          ))}
        </div>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel padding="lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <MappedIcon name="cost" size="sm" />
          Cost by Agent
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Total:</span>
          <KineticNumber value={totalCost} prefix="$" decimals={2} className="font-bold" />
        </div>
      </div>
      <div className="space-y-3">
        {sortedAgents.map((agent) => (
          <CostBar
            key={agent.id}
            value={agent.totalCost || 0}
            max={maxCost}
            label={agent.name.slice(0, 10)}
          />
        ))}
      </div>
    </GlassPanel>
  );
});

export const AgentHeatmap = memo(function AgentHeatmap() {
  const agents = useQuery(api.agents.list, {}) as Agent[] | undefined;
  const activityResult = useQuery(api.activity.list, {});
  const activity = activityResult?.activities as Activity[] | undefined;
  const [now] = useState(() => Date.now());

  const { heatmapData, maxActivity } = useMemo(() => {
    if (!agents || !activity) return { heatmapData: [], maxActivity: 0 };

    // Get last 7 days relative to mount time
    const days = 7;
    const dayMs = 24 * 60 * 60 * 1000;

    const data = agents.map((agent) => {
      const dayBuckets = Array(days).fill(0);

      activity
        .filter((a) => a.agentId === agent.id)
        .forEach((a) => {
          const daysAgo = Math.floor((now - a.createdAt) / dayMs);
          if (daysAgo >= 0 && daysAgo < days) {
            dayBuckets[days - 1 - daysAgo]++;
          }
        });

      return {
        agent,
        buckets: dayBuckets,
        total: dayBuckets.reduce((a, b) => a + b, 0),
      };
    });

    const max = Math.max(...data.flatMap((d) => d.buckets), 1);

    return { heatmapData: data, maxActivity: max };
  }, [agents, activity, now]);

  if (!agents || !activity) {
    return (
      <GlassPanel padding="lg">
        <div className="skeleton h-32 rounded" />
      </GlassPanel>
    );
  }

  const dayLabels = ["6d", "5d", "4d", "3d", "2d", "1d", "now"];

  return (
    <GlassPanel padding="lg">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <MappedIcon name="heatmap" size="sm" />
        Agent Activity Heatmap
      </h3>

      {/* Day labels */}
      <div className="flex items-center mb-1 ml-24">
        {dayLabels.map((label) => (
          <div
            key={label}
            className="w-3.5 text-center text-[10px] mr-0.5"
            style={{ color: "var(--text-dim)" }}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Heatmap grid */}
      <div className="space-y-0.5">
        {heatmapData.map(({ agent, buckets }) => (
          <div key={agent.id} className="flex items-center gap-2">
            <div
              className="w-20 text-xs truncate"
              style={{ color: "var(--text-muted)" }}
              title={agent.name}
            >
              {agent.name}
            </div>
            <div className="flex gap-0.5">
              {buckets.map((value, i) => (
                <HeatmapCell key={i} value={value} max={maxActivity} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-2 mt-3 text-xs" style={{ color: "var(--text-dim)" }}>
        <span>Less</span>
        <div className="flex gap-0.5">
          {[0.1, 0.3, 0.5, 0.7, 1].map((opacity) => (
            <div
              key={opacity}
              className="w-3 h-3 rounded-sm"
              style={{ background: `rgba(16, 163, 127, ${opacity})` }}
            />
          ))}
        </div>
        <span>More</span>
      </div>
    </GlassPanel>
  );
});

export const TaskCompletionChart = memo(function TaskCompletionChart() {
  const tasksResult = useQuery(api.tasks.list, {});
  const tasks = tasksResult?.tasks as Task[] | undefined;

  const stats = useMemo(() => {
    if (!tasks) return null;

    const total = tasks.length;
    const completed = tasks.filter((t) => isCompletedTaskStatus(t.status)).length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const blocked = tasks.filter((t) => t.status === "blocked").length;
    const pending = total - completed - inProgress - blocked;

    return { total, completed, inProgress, blocked, pending };
  }, [tasks]);

  if (!tasks || !stats) {
    return (
      <GlassPanel padding="lg">
        <div className="skeleton h-32 rounded" />
      </GlassPanel>
    );
  }

  return (
    <GlassPanel padding="lg">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <MappedIcon name="chart" size="sm" />
        Task Completion
      </h3>

      <div className="flex items-center gap-6">
        <CompletionRing completed={stats.completed} total={stats.total} />

        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm">
              <span className="w-3 h-3 rounded-full" style={{ background: "var(--accent-success)" }} />
              Completed
            </span>
            <span className="font-mono text-sm">{stats.completed}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm">
              <span className="w-3 h-3 rounded-full" style={{ background: "var(--accent-primary)" }} />
              In Progress
            </span>
            <span className="font-mono text-sm">{stats.inProgress}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm">
              <span className="w-3 h-3 rounded-full" style={{ background: "var(--accent-error)" }} />
              Blocked
            </span>
            <span className="font-mono text-sm">{stats.blocked}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm">
              <span className="w-3 h-3 rounded-full" style={{ background: "var(--text-dim)" }} />
              Pending
            </span>
            <span className="font-mono text-sm">{stats.pending}</span>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
});

// Combined charts view
export const ChartsPanel = memo(function ChartsPanel() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" role="region" aria-label="Dashboard charts">
      <TaskCompletionChart />
      <CostChart />
      <AgentHeatmap />
    </div>
  );
});

export default ChartsPanel;
