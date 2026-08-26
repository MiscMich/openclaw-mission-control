"use client";

import { memo, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convexApi";
import { AgentGrid } from "./AgentGrid";
import { TaskPool } from "./TaskPool";
import { MappedIcon } from "@/components/ui";
import { cn } from "@/lib/utils";
import { DndContext, DragEndEvent, useSensor, useSensors, PointerSensor } from "@dnd-kit/core";
import { toast } from "sonner";

/**
 * SwarmDashboard - Main orchestration view
 *
 * Shows real-time swarm state:
 * - All agents with their current tasks
 * - Open task pool for assignment
 * - Swarm statistics
 */
interface SwarmDashboardProps {
  onAgentClick?: (agentId: string) => void;
}

export const SwarmDashboard = memo(function SwarmDashboard({ onAgentClick }: SwarmDashboardProps) {
  const agentsWithTasks = useQuery(api.agents.listWithCurrentTask, {});
  const openTasks = useQuery(api.tasks.listOpenTasks, {});

  // Calculate swarm stats
  const stats = {
    totalAgents: agentsWithTasks?.length ?? 0,
    activeAgents: agentsWithTasks?.filter(a => a.status === "working").length ?? 0,
    idleAgents: agentsWithTasks?.filter(a => a.status === "idle").length ?? 0,
    openTasks: openTasks?.length ?? 0,
  };

  const loading = agentsWithTasks === undefined || openTasks === undefined;

  // Configure drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required to start drag
      },
    })
  );

  // Handle drag end
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    const taskId = active.id as string;
    const agentId = over.id as string;

    try {
      const response = await fetch("/api/tasks/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskId, agentId }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Failed to claim task");
      }

      const task = (openTasks ?? []).find((item) => item.id === taskId) as
        | { id: string; title?: string; description?: string }
        | undefined;

      let spawnError: string | null = null;
      if (task?.title) {
        try {
          const spawnResponse = await fetch("/api/agents/spawn", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              agentId,
              taskId,
              prompt: `Start task: ${task.title}${
                task.description ? `\n\nDetails:\n${task.description}` : ""
              }`,
            }),
          });
          const spawnPayload = (await spawnResponse.json().catch(() => null)) as
            | { success?: boolean; error?: string }
            | null;
          if (!spawnResponse.ok || !spawnPayload?.success) {
            throw new Error(
              spawnPayload?.error || "Failed to start session"
            );
          }
        } catch (error) {
          spawnError =
            error instanceof Error ? error.message : "Failed to auto-start session";
        }
      }

      if (spawnError) {
        toast.success("Task assigned", {
          description: `Assigned to ${agentId}`,
        });
        toast.error("Auto-start failed", { description: spawnError });
      } else {
        toast.success("Task assigned", {
          description: `Assigned to ${agentId} and started a session`,
        });
      }
    } catch (error) {
      toast.error("Failed to assign task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [openTasks]);

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="swarm-dashboard">
        <div className="swarm-callout">
          <div className="swarm-callout-left">
            <div className="swarm-callout-icon">
              <MappedIcon name="send" size="sm" />
            </div>
            <div className="swarm-callout-text">
              <div className="swarm-callout-title">Manual dispatch</div>
              <div className="swarm-callout-sub">
                Drag tasks onto agents to claim + start sessions. Click an agent card to open details.
              </div>
            </div>
          </div>
          <div className="swarm-callout-right">
            <span className="swarm-callout-pill">
              Automations is for hands-off runs and recurring schedules
            </span>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="swarm-stats">
          <StatCard
            icon="robot"
            label="Total Agents"
            value={stats.totalAgents}
            loading={loading}
          />
          <StatCard
            icon="lightning"
            label="Working"
            value={stats.activeAgents}
            loading={loading}
            accent="var(--accent-primary)"
          />
          <StatCard
            icon="idle"
            label="Idle"
            value={stats.idleAgents}
            loading={loading}
          />
          <StatCard
            icon="tasks"
            label="Open Tasks"
            value={stats.openTasks}
            loading={loading}
          />
        </div>

        {/* Main Grid */}
        <div className="swarm-grid">
          {/* Left: Agent Grid */}
          <div className="swarm-section">
            <div className="swarm-section-header">
              <MappedIcon name="agents" size="sm" />
              <h2 className="swarm-section-title">Agent Swarm</h2>
              <span className="swarm-section-count">
                {stats.activeAgents} active
              </span>
            </div>
            <AgentGrid agents={agentsWithTasks ?? []} onAgentClick={onAgentClick} />
          </div>

          {/* Right: Task Pool */}
          <div className="swarm-section">
            <div className="swarm-section-header">
              <MappedIcon name="tasks" size="sm" />
              <h2 className="swarm-section-title">Task Pool</h2>
              <span className="swarm-section-count">
                {stats.openTasks} open
              </span>
            </div>
            <TaskPool tasks={openTasks ?? []} />
          </div>
        </div>

      <style jsx>{`
        .swarm-dashboard {
          display: flex;
          flex-direction: column;
          gap: 24px;
          height: 100%;
          overflow: hidden;
        }

        .swarm-callout {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 12px 14px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
        }

        .swarm-callout-left {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .swarm-callout-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          flex-shrink: 0;
          border-radius: var(--radius-md);
          background: var(--accent-soft);
          color: var(--accent-primary);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .swarm-callout-text {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .swarm-callout-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .swarm-callout-sub {
          font-size: 12px;
          color: var(--text-muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .swarm-callout-right {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex-shrink: 0;
        }

        .swarm-callout-pill {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-dim);
          padding: 6px 10px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: 999px;
          white-space: nowrap;
        }

        .swarm-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
        }

        .swarm-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          flex: 1;
          min-height: 0;
        }

        .swarm-section {
          display: flex;
          flex-direction: column;
          gap: 16px;
          min-height: 0;
        }

        .swarm-section-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .swarm-section-title {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }

        .swarm-section-count {
          margin-left: auto;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-muted);
          padding: 4px 12px;
          background: var(--bg-elevated);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
        }

        @media (max-width: 1024px) {
          .swarm-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .swarm-callout {
            flex-direction: column;
            align-items: stretch;
          }
          .swarm-callout-sub {
            white-space: normal;
          }
          .swarm-callout-right {
            justify-content: flex-start;
          }
        }
      `}</style>
      </div>
    </DndContext>
  );
});

// ─── Stat Card ───

interface StatCardProps {
  icon: "robot" | "lightning" | "idle" | "tasks";
  label: string;
  value: number;
  accent?: string;
  loading?: boolean;
}

const StatCard = memo(function StatCard({ icon, label, value, accent, loading }: StatCardProps) {
  return (
    <div
      className={cn(
        "stat-card",
        loading && "loading"
      )}
    >
      <div className="stat-card-icon" style={{ color: accent }}>
        <MappedIcon name={icon} size="md" />
      </div>
      <div className="stat-card-content">
        <div className="stat-card-label">{label}</div>
        <div className="stat-card-value" style={{ color: accent }}>
          {loading ? "—" : value}
        </div>
      </div>

      <style jsx>{`
        .stat-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px 20px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          transition: all 150ms ease;
        }

        .stat-card:hover {
          border-color: var(--border-default);
          background: var(--bg-hover);
        }

        .stat-card.loading {
          opacity: 0.5;
        }

        .stat-card-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          background: var(--bg-elevated);
          border-radius: var(--radius-md);
        }

        .stat-card-content {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .stat-card-label {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .stat-card-value {
          font-size: 24px;
          font-weight: 700;
          font-family: var(--font-mono);
          color: var(--text-primary);
          line-height: 1;
        }
      `}</style>
    </div>
  );
});

export default SwarmDashboard;
