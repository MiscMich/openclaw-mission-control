"use client";

import { memo, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convexApi";
import { TimeAgo } from "@/components/ui/TimeAgo";
import { MappedIcon } from "@/components/ui";
import { canonicalAgentId } from "@/lib/agents/identity";

export const NotificationsCenter = memo(function NotificationsCenter() {
  const router = useRouter();
  const notifications = useQuery(api.notifications.listRecent, { limit: 50 });
  const agents = useQuery(api.agents.list, {});
  const undeliveredCounts = useQuery(api.notifications.listUndeliveredCounts, {});
  
  const markDelivered = useMutation(api.notifications.markDelivered);
  const markAllDelivered = useMutation(api.notifications.markAllDelivered);
  
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const normalizedAgents = useMemo(() => {
    if (!agents) return undefined;
    const order: string[] = [];
    const byCanonical = new Map<string, (typeof agents)[number]>();

    for (const agent of agents) {
      const canonicalId = canonicalAgentId(agent.id);
      const existing = byCanonical.get(canonicalId);
      if (!existing) {
        order.push(canonicalId);
        byCanonical.set(canonicalId, agent);
        continue;
      }

      const existingScore =
        (existing.status === "working" ? 2 : 0) + (existing.lastSeen ?? 0) / 1_000_000_000_000;
      const incomingScore =
        (agent.status === "working" ? 2 : 0) + (agent.lastSeen ?? 0) / 1_000_000_000_000;
      if (incomingScore > existingScore) {
        byCanonical.set(canonicalId, agent);
      }
    }

    return order
      .map((id) => byCanonical.get(id))
      .filter((agent): agent is (typeof agents)[number] => Boolean(agent));
  }, [agents]);

  const agentsById = useMemo(() => {
    const map = new Map<string, { name: string }>();
    if (!normalizedAgents) return map;
    for (const agent of normalizedAgents) {
      map.set(agent.id, { name: agent.name });
      map.set(canonicalAgentId(agent.id), { name: agent.name });
      if (agent.id === "main") map.set("coordinator", { name: agent.name });
      if (agent.id === "coordinator") map.set("main", { name: agent.name });
    }
    return map;
  }, [normalizedAgents]);

  const countsByCanonicalAgent = useMemo(() => {
    const map = new Map<string, number>();
    if (!undeliveredCounts) return map;
    for (const item of undeliveredCounts) {
      const canonicalId = canonicalAgentId(item.agentId);
      map.set(canonicalId, (map.get(canonicalId) ?? 0) + item.count);
    }
    return map;
  }, [undeliveredCounts]);

  const filteredNotifications = useMemo(() => {
    if (!notifications) return null;
    let filtered = notifications;
    
    if (filter === "unread") {
      filtered = filtered.filter((n) => !n.delivered);
    }
    
    if (agentFilter) {
      const canonicalFilter = canonicalAgentId(agentFilter);
      filtered = filtered.filter((n) => canonicalAgentId(n.agentId) === canonicalFilter);
    }
    
    return filtered;
  }, [notifications, filter, agentFilter]);

  const unreadCount = useMemo(() => {
    return notifications?.filter((n) => !n.delivered).length ?? 0;
  }, [notifications]);

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      if (agentFilter) {
        const canonicalFilter = canonicalAgentId(agentFilter);
        const pending = (filteredNotifications ?? []).filter(
          (n) => !n.delivered && canonicalAgentId(n.agentId) === canonicalFilter
        );
        await Promise.all(pending.map((notification) => markDelivered({ id: notification.id })));
      } else {
        await markAllDelivered({ agentId: undefined });
      }
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <section className="section-card notifications-center">
      <div className="section-header">
        <div className="notif-header-left">
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <MappedIcon name="notification" size="sm" />
            Notifications
          </h2>
          {unreadCount > 0 && (
            <span className="notif-unread-badge">{unreadCount}</span>
          )}
        </div>
        <div className="notif-header-actions">
          {unreadCount > 0 && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleMarkAllRead}
              disabled={markingAll}
            >
              {markingAll ? "..." : "Mark All Read"}
            </button>
          )}
        </div>
      </div>

      <div className="notif-filters">
        {/* Status Filter */}
        <div className="notif-filter-group">
          <button
            className={`notif-filter-btn ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            className={`notif-filter-btn ${filter === "unread" ? "active" : ""}`}
            onClick={() => setFilter("unread")}
          >
            Unread {unreadCount > 0 && `(${unreadCount})`}
          </button>
        </div>

        {/* Agent Filter */}
        <select
          className="notif-agent-select"
          value={agentFilter ?? ""}
          onChange={(e) => setAgentFilter(e.target.value || null)}
        >
          <option value="">All Agents</option>
          {normalizedAgents?.map((agent) => {
            const count = countsByCanonicalAgent.get(canonicalAgentId(agent.id)) ?? 0;
            return (
              <option key={agent.id} value={agent.id}>
                {agent.name} {count > 0 && `(${count})`}
              </option>
            );
          })}
        </select>
      </div>

      <div className="notif-list">
        {!filteredNotifications ? (
          <div className="notif-loading">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton notif-skeleton" />
            ))}
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="notif-empty">
            <div className="notif-empty-icon" aria-hidden="true"><MappedIcon name="success" size="lg" /></div>
            <div className="notif-empty-title">
              {filter === "unread" ? "All caught up!" : "No notifications"}
            </div>
            <div className="notif-empty-sub">
              {filter === "unread"
                ? "You've read all your notifications"
                : "Notifications will appear here when agents need attention"}
            </div>
          </div>
        ) : (
          filteredNotifications.map((notif) => {
            const agent = agentsById.get(notif.agentId);
            return (
              <div
                key={notif.id}
                className={`notif-item ${!notif.delivered ? "unread" : ""}`}
                onClick={() => {
                  if (notif.taskId) {
                    router.push(`/tasks/${notif.taskId}`);
                  } else {
                    router.push("/?tab=comms");
                  }
                  if (!notif.delivered) {
                    markDelivered({ id: notif.id });
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="notif-item-avatar" aria-hidden="true">
                  {<MappedIcon name="notification" size="sm" />}
                </div>
                <div className="notif-item-body">
                  <div className="notif-item-header">
                    <span className="notif-item-agent">
                      {agent?.name ?? notif.agentId}
                    </span>
                    <span className="notif-item-time">
                      <TimeAgo timestamp={notif.createdAt} />
                    </span>
                  </div>
                  <div className="notif-item-content">{notif.content}</div>
                  {notif.taskId && (
                    <a
                      href={`/tasks/${notif.taskId}`}
                      className="notif-item-task"
                    >
                      <MappedIcon name="tasks" size="xs" /> View Task
                    </a>
                  )}
                </div>
                {!notif.delivered && (
                  <button
                    className="notif-item-mark"
                    onClick={(e) => {
                      e.stopPropagation();
                      markDelivered({ id: notif.id });
                    }}
                    title="Mark as read"
                    aria-label="Mark as read"
                  >
                    <MappedIcon name="success" size="xs" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <style jsx>{`
        .notifications-center {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .notif-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .notif-unread-badge {
          background: var(--accent);
          color: var(--bg-void);
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: var(--radius-full);
        }
        .notif-header-actions {
          display: flex;
          gap: 8px;
        }
        .notif-filters {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          border-bottom: 1px solid var(--hairline);
          gap: 12px;
          flex-wrap: wrap;
        }
        .notif-filter-group {
          display: flex;
          gap: 4px;
          padding: 3px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: var(--radius-md);
          border: 1px solid var(--hairline);
        }
        .notif-filter-btn {
          padding: 6px 12px;
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color var(--transition-fast),
                      color var(--transition-fast);
        }
        .notif-filter-btn:hover {
          color: var(--text-secondary);
        }
        .notif-filter-btn.active {
          background: var(--accent-soft);
          color: var(--accent);
        }
        .notif-agent-select {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-sm);
          padding: 6px 10px;
          color: var(--text-secondary);
          font-size: 11px;
          cursor: pointer;
        }
        .notif-list {
          flex: 1;
          overflow-y: auto;
          padding: 12px 16px;
        }
        .notif-loading {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .notif-skeleton {
          height: 72px;
          border-radius: var(--radius-md);
        }
        .notif-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
          text-align: center;
        }
        .notif-empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }
        .notif-empty-title {
          font-size: 14px;
          color: var(--text-muted);
          margin-bottom: 4px;
        }
        .notif-empty-sub {
          font-size: 12px;
          color: var(--text-dim);
          max-width: 240px;
        }
        .notif-item {
          display: flex;
          gap: 12px;
          padding: 14px 16px;
          margin-bottom: 8px;
          cursor: pointer;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-md);
          transition: background-color var(--transition-normal) cubic-bezier(0.4, 0, 0.2, 1),
                      border-color var(--transition-normal) cubic-bezier(0.4, 0, 0.2, 1),
                      transform var(--transition-normal) cubic-bezier(0.4, 0, 0.2, 1);
          animation: notif-in 0.2s ease-out;
        }
        @keyframes notif-in {
          0% { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .notif-item:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: var(--chrome-strong);
          transform: translateX(4px);
        }
        .notif-item.unread {
          background: rgba(123, 223, 246, 0.05);
          border-color: rgba(123, 223, 246, 0.15);
          border-left: 3px solid var(--accent);
        }
        .notif-item.unread:hover {
          background: rgba(123, 223, 246, 0.08);
        }
        .notif-item-avatar {
          width: 36px;
          height: 36px;
          border-radius: var(--radius-sm);
          background: rgba(255, 255, 255, 0.04);
          display: grid;
          place-items: center;
          font-size: 18px;
          flex-shrink: 0;
        }
        .notif-item-body {
          flex: 1;
          min-width: 0;
        }
        .notif-item-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 4px;
        }
        .notif-item-agent {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .notif-item-time {
          font-size: 10px;
          color: var(--text-dim);
        }
        .notif-item-content {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.4;
        }
        .notif-item-task {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          margin-top: 8px;
          padding: 4px 8px;
          background: rgba(255, 255, 255, 0.04);
          border-radius: var(--radius-sm);
          font-size: 11px;
          color: var(--text-muted);
          text-decoration: none;
          transition: background-color var(--transition-fast),
                      color var(--transition-fast);
        }
        .notif-item-task:hover {
          background: rgba(255, 255, 255, 0.08);
          color: var(--text-secondary);
        }
        .notif-item-mark {
          width: 28px;
          height: 28px;
          border-radius: var(--radius-sm);
          background: transparent;
          border: 1px solid var(--hairline);
          color: var(--text-dim);
          font-size: 14px;
          cursor: pointer;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          transition: background-color var(--transition-fast),
                      border-color var(--transition-fast),
                      color var(--transition-fast);
        }
        .notif-item-mark:hover {
          background: var(--accent-soft);
          border-color: var(--accent-strong);
          color: var(--accent);
        }
      `}</style>
    </section>
  );
});
