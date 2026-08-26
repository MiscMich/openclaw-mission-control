"use client";

import { memo, useState, useCallback, useMemo } from "react";
import { ActivityFilters } from "@/components/dashboard/ActivityFilters";
import { PaginationControls, MappedIcon, type MappedIconName } from "@/components/ui";
import { useConvex, useQuery } from "convex/react";
import { api } from "@/lib/convexApi";
import { TimeAgo } from "@/components/ui";
import Link from "next/link";

type Activity = {
  id: string;
  type: string;
  message: string;
  agentId?: string;
  taskId?: string;
  createdAt: number;
};

type ActivityListResult = {
  activities: Activity[];
  hasMore: boolean;
  cursor?: string;
};

type TaskResultItem = {
  id: string;
  title: string;
  status: string;
  output?: string;
  updatedAt?: number;
  assigneeName?: string | null;
};

const EVENT_ICONS: Record<string, { icon: MappedIconName; className: string }> = {
  task_started: { icon: "lightning", className: "in-progress" },
  task_completed: { icon: "check", className: "completed" },
  task_commented: { icon: "comment", className: "comment" },
  task_created: { icon: "create", className: "created" },
  task_updated: { icon: "refresh", className: "status-change" },
  task_assigned: { icon: "robot", className: "assigned" },
  task_status_changed: { icon: "refresh", className: "status-change" },

  comment_added: { icon: "comment", className: "comment" },
  document_created: { icon: "edit", className: "created" },
  agent_message: { icon: "send", className: "comment" },

  agent_online: { icon: "success", className: "online" },
  agent_offline: { icon: "error", className: "offline" },
  agent_status_changed: { icon: "refresh", className: "status-change" },
  agent_session_start: { icon: "robot", className: "created" },
  agent_spawned: { icon: "agents", className: "created" },
  agent_discovered: { icon: "success", className: "created" },

  code_committed: { icon: "edit", className: "created" },
  deployment: { icon: "dashboard", className: "created" },
  file_modified: { icon: "edit", className: "created" },
  task_progress: { icon: "activity", className: "comment" },

  web_search: { icon: "search", className: "comment" },
  web_fetch: { icon: "download", className: "created" },
  message_sent: { icon: "send", className: "comment" },
};

const RESULT_STATUS_SET = new Set(["done", "completed", "blocked", "failed"]);

function summarizeOutput(output?: string) {
  if (!output) return "No completion summary provided yet.";
  const normalized = output.replace(/\s+/g, " ").trim();
  if (normalized.length <= 120) return normalized;
  return `${normalized.slice(0, 117)}...`;
}

function statusLabel(status: string) {
  if (status === "done" || status === "completed") return "Done";
  if (status === "blocked") return "Blocked";
  if (status === "failed") return "Failed";
  return status;
}

function statusClassName(status: string) {
  if (status === "done" || status === "completed") return "result-status done";
  if (status === "blocked") return "result-status blocked";
  if (status === "failed") return "result-status failed";
  return "result-status";
}

const ActivityItem = memo(function ActivityItem({
  activity,
  agentName,
}: {
  activity: Activity;
  agentName?: string;
}) {
  const eventConfig = EVENT_ICONS[activity.type] ?? {
    icon: "activity" as MappedIconName,
    className: "",
  };
  const displayAgentName = agentName || (activity.agentId ? activity.agentId.toUpperCase() : undefined);

  const content = (
    <div className="flex items-start gap-3">
      <div
        className={`activity-icon ${eventConfig.className}`}
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-elevated)",
        }}
      >
        <MappedIcon name={eventConfig.icon} size="sm" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm" style={{ color: "var(--text-primary)" }}>
          {displayAgentName && (
            <span style={{ color: "var(--accent-primary)", fontWeight: 500 }}>
              {displayAgentName}
            </span>
          )}{" "}
          {activity.message}
        </div>
        <div className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
          <TimeAgo timestamp={activity.createdAt} />
        </div>
      </div>
    </div>
  );

  if (activity.taskId) {
    return (
      <Link
        href={`/tasks/${activity.taskId}`}
        className="block p-3 rounded-lg border transition-all hover:border-[var(--accent-primary)] hover:shadow-sm"
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      className="p-3 rounded-lg border"
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--border-subtle)",
      }}
    >
      {content}
    </div>
  );
});

export const ActivityFeedWithFilters = memo(function ActivityFeedWithFilters() {
  const convex = useConvex();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string | undefined>(undefined);
  const [agentId, setAgentId] = useState<string | undefined>(undefined);
  const [loadedActivities, setLoadedActivities] = useState<Activity[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [hasMoreOverride, setHasMoreOverride] = useState<boolean | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hideNoise, setHideNoise] = useState(true);
  const pageSize = 20;

  // Fetch activity with filters
  const result = useQuery(api.activity.list, {
    search: search.length >= 2 ? search : undefined,
    type,
    agentId,
    limit: pageSize,
  });

  const agents = useQuery(api.agents.list, {});
  const tasksResult = useQuery(api.tasks.list, { limit: 120 });

  const baseActivities = useMemo(
    () => (result?.activities as Activity[] | undefined) ?? [],
    [result?.activities]
  );
  const hasMore = hasMoreOverride ?? (result?.hasMore ?? false);
  const loading = result === undefined && loadedActivities.length === 0;

  // Build agent lookup
  const agentsById = useMemo(() => {
    const map = new Map<string, { name: string }>();
    for (const agent of agents ?? []) {
      map.set(agent.id, { name: agent.name });
    }
    return map;
  }, [agents]);

  const displayActivities = useMemo(() => {
    const byId = new Map<string, Activity>();
    for (const activity of baseActivities) {
      byId.set(activity.id, activity);
    }
    for (const activity of loadedActivities) {
      byId.set(activity.id, activity);
    }

    const merged = Array.from(byId.values());

    if (!hideNoise) return merged;
    if (type) return merged; // explicit type filter wins

    const NOISE_TYPES = new Set([
      // These tend to spam and don’t usually represent “work done”.
      "agent_online",
      "agent_offline",
      "agent_status_changed",
      "agent_session_start",
      "agent_discovered",
    ]);

    return merged.filter((activity) => !NOISE_TYPES.has(activity.type));
  }, [baseActivities, hideNoise, loadedActivities, type]);

  const recentResults = useMemo(() => {
    const source = (tasksResult?.tasks as TaskResultItem[] | undefined) ?? [];
    return source
      .filter((task) => RESULT_STATUS_SET.has(task.status))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .slice(0, 5);
  }, [tasksResult?.tasks]);

  const resetPagination = useCallback(() => {
    setLoadedActivities([]);
    setNextCursor(undefined);
    setHasMoreOverride(null);
  }, []);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      resetPagination();
    },
    [resetPagination]
  );

  const handleTypeChange = useCallback(
    (value: string | undefined) => {
      setType(value);
      resetPagination();
    },
    [resetPagination]
  );

  const handleAgentChange = useCallback(
    (value: string | undefined) => {
      setAgentId(value);
      resetPagination();
    },
    [resetPagination]
  );

  const handleClearFilters = useCallback(() => {
    setSearch("");
    setType(undefined);
    setAgentId(undefined);
    resetPagination();
  }, [resetPagination]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore) return;
    const cursor = nextCursor ?? result?.cursor;
    if (!cursor) return;

    setLoadingMore(true);
    try {
      const nextPage = (await convex.query(api.activity.list, {
        search: search.length >= 2 ? search : undefined,
        type,
        agentId,
        limit: pageSize,
        cursor,
      })) as ActivityListResult;

      const pageActivities = Array.isArray(nextPage?.activities) ? nextPage.activities : [];
      setLoadedActivities((previous) => {
        const byId = new Map(previous.map((item) => [item.id, item]));
        for (const item of pageActivities) {
          byId.set(item.id, item);
        }
        return Array.from(byId.values());
      });
      setNextCursor(nextPage.cursor);
      setHasMoreOverride(nextPage.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }, [agentId, convex, loadingMore, nextCursor, pageSize, result, search, type]);

  return (
    <section className="section-card flex flex-col h-full min-h-0">
      <div className="section-header flex-shrink-0">
        <div>
          <h2
            className="section-title"
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            <MappedIcon name="activity" size="sm" />
            Activity Feed
          </h2>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Recent activity and events
          </p>
        </div>
      </div>

      <div className="section-body flex-1 min-h-0 overflow-hidden flex flex-col">
        <div
          className="rounded-lg border p-3 mb-4"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold tracking-wide" style={{ color: "var(--text-dim)" }}>
              RECENT RESULTS
            </p>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {recentResults.length}
            </span>
          </div>
          {recentResults.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Completed/blocked results will appear here so you can review outcomes quickly.
            </p>
          ) : (
            <div className="space-y-2">
              {recentResults.map((task) => (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="block rounded-md border p-2 transition-all hover:border-[var(--accent-primary)]"
                  style={{
                    background: "var(--bg-elevated)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                      {task.title}
                    </p>
                    <span className={statusClassName(task.status)}>{statusLabel(task.status)}</span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    {summarizeOutput(task.output)}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Filters */}
        <ActivityFilters
          search={search}
          onSearchChange={handleSearchChange}
          type={type}
          onTypeChange={handleTypeChange}
          agentId={agentId}
          onAgentChange={handleAgentChange}
          hideNoise={hideNoise}
          onHideNoiseChange={(next) => setHideNoise(next)}
          onClearAll={handleClearFilters}
        />

        {/* Activity List */}
        <div className="mt-6 space-y-2 flex-1 min-h-0 overflow-y-auto pr-1">
          {loading && displayActivities.length === 0 ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton h-16 rounded-lg" />
              ))}
            </div>
          ) : displayActivities.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3" aria-hidden="true">
                <MappedIcon name="activity" size="lg" />
              </div>
              <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                No activity found
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
                Try adjusting your filters
              </div>
            </div>
          ) : (
            displayActivities.map((activity) => (
              <ActivityItem
                key={activity.id}
                activity={activity}
                agentName={
                  activity.agentId
                    ? agentsById.get(activity.agentId)?.name
                    : undefined
                }
              />
            ))
          )}
        </div>

        {/* Load More */}
        {displayActivities.length > 0 && (
          <div className="pt-4 flex-shrink-0">
            <PaginationControls
              currentPage={1}
              hasMore={hasMore}
              isLoading={loading || loadingMore}
              onPreviousPage={() => {}}
              onNextPage={handleLoadMore}
              onLoadMore={handleLoadMore}
              showLoadMore={true}
              total={displayActivities.length}
              pageSize={pageSize}
            />
          </div>
        )}
      </div>

      <style jsx>{`
        .result-status {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          background: rgba(148, 163, 184, 0.16);
          color: var(--text-muted);
        }

        .result-status.done {
          background: rgba(34, 197, 94, 0.18);
          color: #22c55e;
        }

        .result-status.blocked {
          background: rgba(245, 158, 11, 0.2);
          color: #f59e0b;
        }

        .result-status.failed {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }
      `}</style>
    </section>
  );
});
