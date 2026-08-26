"use client";

import { memo, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convexApi";
import { MappedIcon } from "@/components/ui";

type TabId = "overview" | "agents" | "tasks";

interface AgentUsage {
  id: string;
  name: string;
  tokens: number;
  cost: number;
  todayTokens: number;
  todayCost: number;
  usageSyncedAt: number;
  taskCount: number;
}

interface TaskUsage {
  id: string;
  title: string;
  assigneeName: string | null;
  assigneeEmoji: string | null;
  tokens: number;
  cost: number;
  status: string;
}

export const UsageDashboard = memo(function UsageDashboard() {
  const agents = useQuery(api.agents.list, {});
  const tasksResult = useQuery(api.tasks.list, {});
  const tasks = tasksResult?.tasks;
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const usage = useMemo(() => {
    if (!agents || !tasks) return null;

    // Overview stats
    const totalAgentTokens = agents.reduce((sum, a) => sum + (a.totalTokens ?? 0), 0);
    const totalAgentCost = agents.reduce((sum, a) => sum + (a.totalCost ?? 0), 0);
    const totalTodayTokens = agents.reduce((sum, a) => sum + (a.todayTokens ?? 0), 0);
    const totalTodayCost = agents.reduce((sum, a) => sum + (a.todayCost ?? 0), 0);
    const latestUsageSyncedAt = agents.reduce((latest, a) => {
      const syncedAt = typeof a.usageSyncedAt === "number" ? a.usageSyncedAt : 0;
      return Math.max(latest, syncedAt);
    }, 0);
    const totalTaskTokens = tasks.reduce((sum, t) => sum + (t.tokensUsed ?? 0), 0);
    const totalTaskCost = tasks.reduce((sum, t) => sum + (t.costUsd ?? 0), 0);

    // Per-agent breakdown
    const agentUsage: AgentUsage[] = agents.map((agent) => {
      const agentTasks = tasks.filter((t) => 
        t.assigneeIds?.includes(agent.id) || t.assigneeId === agent.id
      );
      return {
        id: agent.id,
        name: agent.name,
        // emoji removed
        tokens: agent.totalTokens ?? 0,
        cost: agent.totalCost ?? 0,
        todayTokens: agent.todayTokens ?? 0,
        todayCost: agent.todayCost ?? 0,
        usageSyncedAt: agent.usageSyncedAt ?? 0,
        taskCount: agentTasks.length,
      };
    }).sort((a, b) => b.cost - a.cost);

    // Per-task breakdown (only tasks with usage)
    const taskUsage: TaskUsage[] = tasks
      .filter((t) => (t.tokensUsed ?? 0) > 0 || (t.costUsd ?? 0) > 0)
      .map((task) => ({
        id: task.id,
        title: task.title,
        assigneeName: task.assigneeName,
        assigneeEmoji: task.assigneeEmoji,
        tokens: task.tokensUsed ?? 0,
        cost: task.costUsd ?? 0,
        status: task.status,
      }))
      .sort((a, b) => b.cost - a.cost);

    return {
      totalAgentTokens,
      totalAgentCost,
      totalTodayTokens,
      totalTodayCost,
      latestUsageSyncedAt,
      totalTaskTokens,
      totalTaskCost,
      agentUsage,
      taskUsage,
    };
  }, [agents, tasks]);

  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "agents", label: "By Agent" },
    { id: "tasks", label: "By Task" },
  ];

  return (
    <section className="section-card">
      <div className="section-header">
        <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <MappedIcon name="cost" size="sm" />
          Usage Dashboard
        </h2>
      </div>
      <div className="section-body">
        {/* Tab Navigation */}
        <div className="usage-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`usage-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {!usage ? (
          <div className="space-y-3 mt-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton h-12 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="mt-4">
            {/* Overview Tab */}
            {activeTab === "overview" && (
              <div className="usage-overview">
                <div className="usage-stat-card total">
                  <div className="usage-stat-icon" aria-hidden="true"><MappedIcon name="success" size="md" /></div>
                  <div className="usage-stat-content">
                    <div className="usage-stat-label">Agent Lifetime Spend</div>
                    <div className="usage-stat-value highlight">
                      ${usage.totalAgentCost.toFixed(2)}
                    </div>
                  </div>
                </div>
                <div className="usage-stat-grid">
                  <div className="usage-stat-card">
                    <div className="usage-stat-icon" aria-hidden="true"><MappedIcon name="clock" size="md" /></div>
                      <div className="usage-stat-content">
                      <div className="usage-stat-label">Today (Last Sync)</div>
                      <div className="usage-stat-value">
                        {usage.totalTodayTokens.toLocaleString()}
                      </div>
                      <div className="usage-stat-sub">
                        ${usage.totalTodayCost.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="usage-stat-card">
                    <div className="usage-stat-icon" aria-hidden="true"><MappedIcon name="agents" size="md" /></div>
                    <div className="usage-stat-content">
                      <div className="usage-stat-label">Agent Tokens</div>
                      <div className="usage-stat-value">
                        {usage.totalAgentTokens.toLocaleString()}
                      </div>
                      <div className="usage-stat-sub">
                        ${usage.totalAgentCost.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="usage-stat-card">
                    <div className="usage-stat-icon" aria-hidden="true"><MappedIcon name="tasks" size="md" /></div>
                    <div className="usage-stat-content">
                      <div className="usage-stat-label">Task Spend (Recorded)</div>
                      <div className="usage-stat-value">
                        {usage.totalTaskTokens.toLocaleString()}
                      </div>
                      <div className="usage-stat-sub">
                        ${usage.totalTaskCost.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-xs" style={{ color: "var(--text-dim)" }}>
                  Agent lifetime spend and task spend are shown separately to avoid double counting.
                </div>
                <div className="text-xs" style={{ color: "var(--text-dim)" }}>
                  Usage last synced:{" "}
                  {usage.latestUsageSyncedAt
                    ? new Date(usage.latestUsageSyncedAt).toLocaleString()
                    : "unknown"}
                </div>
              </div>
            )}

            {/* By Agent Tab */}
            {activeTab === "agents" && (
              <div className="usage-list">
                {usage.agentUsage.length === 0 ? (
                  <div className="usage-empty">No agent usage recorded yet</div>
                ) : (
                  usage.agentUsage.map((agent) => (
                    <div key={agent.id} className="usage-row">
                      <div className="usage-row-left">
                        <div className="usage-row-info">
                          <div className="usage-row-name">{agent.name}</div>
                          <div className="usage-row-meta">
                            {agent.taskCount} tasks · {agent.tokens.toLocaleString()} tokens · today {agent.todayTokens.toLocaleString()} tokens
                          </div>
                        </div>
                      </div>
                      <div className="usage-row-cost" title={`Synced ${agent.usageSyncedAt ? new Date(agent.usageSyncedAt).toLocaleString() : "unknown"}`}>
                        ${agent.cost.toFixed(2)} · ${agent.todayCost.toFixed(2)} today
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* By Task Tab */}
            {activeTab === "tasks" && (
              <div className="usage-list">
                {usage.taskUsage.length === 0 ? (
                  <div className="usage-empty">No task usage recorded yet</div>
                ) : (
                  usage.taskUsage.map((task) => (
                    <div key={task.id} className="usage-row">
                      <div className="usage-row-left">
                        <div className="usage-row-info">
                          <div className="usage-row-name">{task.title}</div>
                          <div className="usage-row-meta">
                            {task.assigneeName ?? "Unassigned"} · {task.tokens.toLocaleString()} tokens
                            <span className={`task-status-mini ${task.status}`}>{task.status}</span>
                          </div>
                        </div>
                      </div>
                      <div className="usage-row-cost">
                        ${task.cost.toFixed(2)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .usage-tabs {
          display: flex;
          gap: 4px;
          padding: 4px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: var(--radius-md);
          border: 1px solid var(--hairline);
        }
        .usage-tab {
          flex: 1;
          padding: 8px 12px;
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background-color var(--transition-fast),
                      color var(--transition-fast);
        }
        .usage-tab:hover {
          color: var(--text-secondary);
          background: rgba(255, 255, 255, 0.04);
        }
        .usage-tab.active {
          color: var(--accent);
          background: var(--accent-soft);
        }
        .usage-overview {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .usage-stat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px;
        }
        .usage-stat-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-md);
          transition: background-color var(--transition-normal),
                      border-color var(--transition-normal),
                      transform var(--transition-normal),
                      box-shadow var(--transition-normal);
        }
        .usage-stat-card:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: var(--chrome);
          transform: translateY(-2px);
        }
        .usage-stat-card.total {
          background: linear-gradient(135deg, rgba(123, 223, 246, 0.08), rgba(101, 227, 165, 0.08));
          border-color: rgba(123, 223, 246, 0.2);
        }
        .usage-stat-card.total:hover {
          background: linear-gradient(135deg, rgba(123, 223, 246, 0.12), rgba(101, 227, 165, 0.12));
          box-shadow: 0 8px 24px rgba(123, 223, 246, 0.15);
        }
        .usage-stat-icon {
          font-size: 24px;
        }
        .usage-stat-content {
          flex: 1;
        }
        .usage-stat-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-dim);
        }
        .usage-stat-value {
          font-size: 20px;
          font-weight: 700;
          color: var(--text-primary);
        }
        .usage-stat-value.highlight {
          color: var(--state-success);
        }
        .usage-stat-sub {
          font-size: 12px;
          color: var(--state-success);
          margin-top: 2px;
        }
        .usage-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 320px;
          overflow-y: auto;
        }
        .usage-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-md);
          transition: background-color var(--transition-normal) cubic-bezier(0.4, 0, 0.2, 1),
                      border-color var(--transition-normal) cubic-bezier(0.4, 0, 0.2, 1),
                      transform var(--transition-normal) cubic-bezier(0.4, 0, 0.2, 1);
        }
        .usage-row:hover {
          border-color: var(--chrome-strong);
          background: rgba(255, 255, 255, 0.05);
          transform: translateX(4px);
        }
        .usage-row-left {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }
        .usage-row-emoji {
          font-size: 18px;
          flex-shrink: 0;
        }
        .usage-row-info {
          min-width: 0;
        }
        .usage-row-name {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .usage-row-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: var(--text-dim);
          margin-top: 2px;
        }
        .usage-row-cost {
          font-size: 14px;
          font-weight: 600;
          color: var(--state-success);
          flex-shrink: 0;
        }
        .usage-empty {
          text-align: center;
          padding: 24px;
          color: var(--text-muted);
          font-size: 13px;
        }
        .task-status-mini {
          padding: 2px 6px;
          border-radius: var(--radius-sm);
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--hairline);
        }
        .task-status-mini.completed,
        .task-status-mini.done {
          color: var(--state-success);
          border-color: rgba(101, 227, 165, 0.3);
        }
        .task-status-mini.in_progress {
          color: var(--state-running);
          border-color: var(--accent-strong);
        }
      `}</style>
    </section>
  );
});
