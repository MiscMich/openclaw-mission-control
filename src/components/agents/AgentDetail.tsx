"use client";

import { memo, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { StatusDot } from "@/components/ui/StatusDot";
import { TimeAgo } from "@/components/ui/TimeAgo";
import { TaskCard } from "@/components/tasks/TaskCard";
import { HeartbeatLog } from "@/components/agents/HeartbeatLog";
import { Button, MappedIcon } from "@/components/ui";
import { useQuery } from "convex/react";
import { api } from "@/lib/convexApi";
import { toast } from "sonner";
import { canonicalAgentId } from "@/lib/agents/identity";
import { isCompletedTaskStatus } from "@/lib/tasks/status";

const LiveTerminal = dynamic(
  () => import("@/components/dashboard/LiveTerminal").then((module) => module.LiveTerminal),
  { ssr: false }
);

const AgentChat = dynamic(
  () => import("@/components/dashboard/AgentChat").then((module) => module.AgentChat),
  { ssr: false }
);

type Agent = {
  name: string;
  emoji: string;
  role: string;
  model: string;
  status: string;
  lastSeen: number;
  currentTaskId?: string | null;
  totalCost?: number;
  totalTokens?: number;
};

type Task = {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assigneeName?: string;
  assigneeEmoji?: string;
  createdAt: number;
  sessionKey?: string | null;
  [key: string]: unknown;
};

export const AgentDetail = memo(function AgentDetail({ agentId }: { agentId: string }) {
  const agent = useQuery(api.agents.getById, { id: agentId }) as Agent | undefined;
  const tasksResult = useQuery(api.tasks.list, { assigneeId: agentId });
  const tasksData = tasksResult?.tasks;
  const tasks = useMemo(() => (tasksData ?? []) as Task[], [tasksData]);
  const agentSettings = useQuery(api.agentSettings.get, { agentId });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [heartbeatLoading, setHeartbeatLoading] = useState(false);

  const currentTask = useMemo(() => {
    if (!agent?.currentTaskId || !tasks) return null;
    return tasks.find((t) => t.id === agent.currentTaskId) ?? null;
  }, [agent, tasks]);

  const stats = useMemo(() => {
    if (!tasks) return null;
    const completed = tasks.filter((t) => isCompletedTaskStatus(t.status));
    return {
      completed: completed.length,
      cost: agent?.totalCost ?? 0,
      tokens: agent?.totalTokens ?? 0,
    };
  }, [tasks, agent?.totalCost, agent?.totalTokens]);

  const isWorking = agent?.status === "working";

  useEffect(() => {
    let active = true;

    const resolveSession = async () => {
      if (!agentId) return;

      if (currentTask?.sessionKey) {
        setSessionId(currentTask.sessionKey);
        return;
      }

      if (agentSettings?.sessionKey) {
        setSessionId(agentSettings.sessionKey);
        return;
      }

      try {
        const res = await fetch("/api/sessions");
        const data = await res.json();
        if (!active) return;
        if (!Array.isArray(data)) return;
        const expected = canonicalAgentId(agentId);
        const match = data.find((session: { agent?: string; key?: string; id?: string }) => {
          if (!session?.agent) return false;
          return canonicalAgentId(session.agent) === expected;
        }) as { key?: string; id?: string } | undefined;
        setSessionId(match?.key ?? match?.id ?? null);
      } catch {
        if (!active) return;
        setSessionId(null);
      }
    };

    resolveSession();

    return () => {
      active = false;
    };
  }, [agentId, currentTask?.sessionKey, agentSettings?.sessionKey]);

  const runHeartbeatNow = async () => {
    try {
      setHeartbeatLoading(true);
      const response = await fetch(`/api/agents/${agentId}/heartbeat/trigger`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        tasks?: number;
        notifications?: number;
        dispatched?: boolean;
        heartbeatIntervalMinutes?: number;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Failed to trigger heartbeat");
      }

      const heartbeatIntervalMinutes = payload.heartbeatIntervalMinutes ?? 1;
      const dispatched = payload.dispatched
        ? "check-in sent now"
        : `queued for the next ${heartbeatIntervalMinutes}m check-in`;
      toast.success(`Check-in triggered for ${agent?.name ?? agentId}`, {
        description: `${payload.tasks ?? 0} tasks · ${payload.notifications ?? 0} notifications · ${dispatched}`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to trigger heartbeat");
    } finally {
      setHeartbeatLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Agent Header Card */}
      <div className="section-card">
        <div className="p-6">
          {!agent ? (
            <div className="space-y-3">
              <div className="skeleton h-6 w-40 rounded" />
              <div className="skeleton h-4 w-64 rounded" />
            </div>
          ) : (
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div 
                  className={`agent-avatar flex h-16 w-16 items-center justify-center rounded-xl text-3xl ${isWorking ? "working" : ""}`}
                  style={{ 
                    background: isWorking ? "var(--accent-cyan-subtle)" : "var(--bg-floating)",
                    border: `1px solid ${isWorking ? "var(--accent-cyan)" : "var(--border-default)"}`
                  }}
                >
                  
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <span 
                      className="text-xl font-bold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {agent.name}
                    </span>
                    <StatusDot status={agent.status} pulse={isWorking} showLabel />
                  </div>
                  <div 
                    className="text-sm mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {agent.role}
                  </div>
                  <div 
                    className="text-xs mt-1 font-mono"
                    style={{ color: "var(--text-dim)" }}
                  >
                    {agent.model} · Last seen <TimeAgo timestamp={agent.lastSeen} />
                  </div>
                  <div className="mt-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      mappedIcon="clock"
                      loading={heartbeatLoading}
                      onClick={runHeartbeatNow}
                    >
                      Run Heartbeat Now
                    </Button>
                  </div>
                </div>
              </div>
              
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div 
                  className="rounded-xl p-4"
                  style={{ 
                    background: "var(--bg-floating)",
                    border: "1px solid var(--border-subtle)"
                  }}
                >
                  <div 
                    className="text-xs uppercase font-semibold tracking-wider"
                    style={{ color: "var(--text-dim)" }}
                  >
                    Tasks Completed
                  </div>
                  <div 
                    className="text-2xl font-bold mt-1"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {stats?.completed ?? "—"}
                  </div>
                </div>
                <div 
                  className="rounded-xl p-4"
                  style={{ 
                    background: "var(--bg-floating)",
                    border: "1px solid var(--border-subtle)"
                  }}
                >
                  <div 
                    className="text-xs uppercase font-semibold tracking-wider"
                    style={{ color: "var(--text-dim)" }}
                  >
                    Total Tokens
                  </div>
                  <div 
                    className="text-2xl font-bold mt-1"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {(stats?.tokens ?? 0).toLocaleString()}
                  </div>
                </div>
                <div 
                  className="rounded-xl p-4"
                  style={{ 
                    background: "var(--bg-floating)",
                    border: "1px solid var(--border-subtle)"
                  }}
                >
                  <div 
                    className="text-xs uppercase font-semibold tracking-wider"
                    style={{ color: "var(--text-dim)" }}
                  >
                    Total Cost
                  </div>
                  <div 
                    className="text-2xl font-bold mt-1"
                    style={{ color: "var(--state-success)" }}
                  >
                    ${(stats?.cost ?? 0).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-[1.4fr,0.6fr]">
        <div className="space-y-6">
          {/* Current Task */}
          <div className="section-card">
            <div className="section-header">
              <h3 className="section-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <MappedIcon name="lightning" size="sm" />
                Current Task
              </h3>
              {isWorking && <span className="live-indicator">Active</span>}
            </div>
            <div className="section-body">
              {!agent ? (
                <div className="skeleton h-20 w-full rounded-lg" />
              ) : currentTask ? (
                <TaskCard task={currentTask} />
              ) : (
                <div className="empty-state-card animate-fade-in">
                  <div className="empty-state-visual">
                    <div className="empty-pulse-ring" />
                    <span className="empty-icon" aria-hidden="true"><MappedIcon name="clock" size="md" /></span>
                  </div>
                  <div className="empty-state-text-group">
                    <span className="empty-state-label">STANDBY MODE</span>
                    <span className="empty-state-hint">Agent ready for assignment</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Recent Tasks */}
          <div className="section-card">
            <div className="section-header">
              <h3 className="section-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <MappedIcon name="tasks" size="sm" />
                Recent Tasks
              </h3>
              <span className="section-badge">{tasks.length} total</span>
            </div>
            <div className="section-body">
              {!tasks ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="skeleton h-16 w-full rounded-lg" />
                  ))}
                </div>
              ) : tasks.length === 0 ? (
                <div className="empty-state-minimal animate-fade-in">
                  <span className="empty-icon-small" aria-hidden="true"><MappedIcon name="notification" size="sm" /></span>
                  <span className="empty-minimal-text">No task history</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {tasks.slice(0, 5).map((task) => (
                    <TaskCard key={task.id} task={task} compact />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Live Terminal + Heartbeat Log */}
        <div className="space-y-6">
          <div className="section-card">
            <div className="section-header">
              <h3 className="section-title">Live Session</h3>
              {sessionId && (
                <span className="section-badge">
                  {sessionId.slice(0, 8)}
                </span>
              )}
            </div>
            <div className="section-body">
              <LiveTerminal sessionId={sessionId ?? undefined} agentName={agent?.name} />
            </div>
          </div>
          <HeartbeatLog agentId={agentId} />
          <div style={{ minHeight: 380 }}>
            <AgentChat currentAgentId={agentId} />
          </div>
        </div>
      </div>
    </div>
  );
});
