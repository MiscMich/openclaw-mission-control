"use client";

import { memo, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { TimeAgo } from "@/components/ui/TimeAgo";
import { useQuery } from "convex/react";
import { api } from "@/lib/convexApi";
import { MappedIcon, ActivityItemSkeleton, type MappedIconName } from "@/components/ui";

// =============================================================================
// EVENT ICON MAPPING (hoisted outside per rerender-memo-with-default-value)
// =============================================================================

const EVENT_ICONS: Record<string, { icon: MappedIconName; className: string }> = {
  task_started: { icon: "lightning", className: "in-progress" },
  task_completed: { icon: "check", className: "completed" },
  task_commented: { icon: "comment", className: "comment" },
  task_created: { icon: "create", className: "created" },
  task_assigned: { icon: "robot", className: "assigned" },
  task_status_change: { icon: "refresh", className: "status-change" },
  agent_online: { icon: "success", className: "online" },
  agent_offline: { icon: "error", className: "offline" },
  comment_added: { icon: "comment", className: "comment" },
  document_created: { icon: "files", className: "created" },
  notification_sent: { icon: "notification", className: "assigned" },
};

// Animation config (hoisted outside per rendering-hoist-jsx rule)
const staggerTransition = {
  duration: 0.25,
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const ActivityFeed = memo(function ActivityFeed({
  hasWorkingAgents,
}: {
  hasWorkingAgents?: boolean;
}) {
  const activityResult = useQuery(api.activity.list, {});
  const agents = useQuery(api.agents.list, {});
  const activity = activityResult?.activities;

  // Build agent lookup map BEFORE loading check to prevent race condition
  // This ensures we never show "Unknown Agent" even if agents loads slightly after activity
  const agentsById = useMemo(() => {
    const map = new Map<string, { name: string }>();
    if (!agents) return map;
    for (const agent of agents) {
      map.set(agent.id, { name: agent.name });
    }
    return map;
  }, [agents]);

  // Group consecutive heartbeat entries
  const processedActivity = useMemo(() => {
    if (!activity) return [];

    const result: Array<typeof activity[0] | { id: string; type: string; message: string; createdAt: number; agentId?: string; taskId?: string; isHeartbeatGroup: true; count: number; oldestTimestamp: number }> = [];
    let heartbeatBuffer: typeof activity = [];

    const isHeartbeat = (item: typeof activity[0]) => {
      const msg = item.message?.toLowerCase() || "";
      const type = item.type?.toLowerCase() || "";
      return msg.includes("heartbeat") || msg.includes("heartbeat_ok") || type.includes("heartbeat");
    };

    const flushHeartbeats = () => {
      if (heartbeatBuffer.length === 0) return;

      if (heartbeatBuffer.length === 1) {
        // Single heartbeat - add as-is
        result.push(heartbeatBuffer[0]);
      } else {
        // Multiple heartbeats - group them
        const newest = heartbeatBuffer[0];
        const oldest = heartbeatBuffer[heartbeatBuffer.length - 1];
        const groupedWindowMs = Math.max(newest.createdAt - oldest.createdAt, 0);
        const minutes = Math.max(1, Math.ceil(groupedWindowMs / 60000));
        const timeLabel = minutes === 1 ? "last minute" : `last ${minutes}m`;

        result.push({
          id: `heartbeat-group-${newest.id}`,
          type: "heartbeat",
          message: `${heartbeatBuffer.length} heartbeats in the ${timeLabel}`,
          createdAt: newest.createdAt,
          agentId: newest.agentId,
          isHeartbeatGroup: true,
          count: heartbeatBuffer.length,
          oldestTimestamp: oldest.createdAt,
        });
      }
      heartbeatBuffer = [];
    };

    for (const item of activity) {
      if (isHeartbeat(item)) {
        heartbeatBuffer.push(item);
      } else {
        flushHeartbeats();
        result.push(item);
      }
    }

    // Flush any remaining heartbeats
    flushHeartbeats();

    return result;
  }, [activity]);

  // Only wait for activity to load - agents can load asynchronously
  const loading = activity === undefined;

  return (
    <section className="section-card flex flex-col h-full" aria-label="Activity feed">
      <div className="section-header flex-shrink-0">
        <div className="flex items-center justify-between w-full gap-3">
          <h2 className="section-title flex items-center gap-2">
            <MappedIcon name="activity" size="sm" />
            Activity
          </h2>
          <div
            className={`activity-live-indicator ${hasWorkingAgents ? "is-live" : ""}`}
            aria-live="polite"
            aria-label={hasWorkingAgents ? "Live: agents working" : "Not live: no agents working"}
          >
            <span className="activity-live-dot" aria-hidden="true" />
            <span>LIVE</span>
          </div>
        </div>
      </div>
      <div className="section-body flex-1 min-h-0 overflow-hidden">
        {loading || !activity ? (
          <ActivityItemSkeleton count={6} />
        ) : activity.length === 0 ? (
          <div className="activity-empty-state animate-fade-in">
            <div className="activity-empty-visual">
              <div className="radar-sweep" />
              <span className="radar-icon">
                <MappedIcon name="activity" size="lg" />
              </span>
            </div>
            <div className="activity-empty-content">
              <span className="activity-empty-label">MONITORING</span>
              <span className="activity-empty-desc">Awaiting agent transmissions</span>
            </div>
            <div className="activity-empty-dots" aria-hidden="true">
              <span className="empty-dot" style={{ animationDelay: "0s" }} />
              <span className="empty-dot" style={{ animationDelay: "0.2s" }} />
              <span className="empty-dot" style={{ animationDelay: "0.4s" }} />
            </div>
          </div>
        ) : (
          <div className="space-y-1 h-full overflow-y-auto pr-1" role="list" aria-label="Recent activity">
            <AnimatePresence mode="popLayout" initial={false}>
              {processedActivity.map((item, index) => {
                const eventConfig = EVENT_ICONS[item.type] ?? { icon: "activity" as MappedIconName, className: "" };
                const agent = item.agentId ? agentsById.get(item.agentId) : undefined;
                // Show agent name if found, otherwise "System" for system events
                const agentLabel = agent
                  ? agent.name
                  : item.agentId
                    ? item.agentId.toUpperCase()
                    : "System";

                const content = (
                  <>
                    <div className={`activity-icon ${eventConfig.className}`} aria-hidden="true">
                      <MappedIcon name={eventConfig.icon} size="sm" />
                    </div>
                    <div className="activity-content">
                      <div className="activity-message">
                        {item.agentId ? (
                          <Link
                            href={`/agents/${item.agentId}`}
                            className="activity-agent-link"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {agentLabel}
                          </Link>
                        ) : (
                          <span className="activity-agent">{agentLabel}</span>
                        )}{" "}
                        <span className="activity-text">{item.message}</span>
                      </div>
                      <div className="activity-time">
                        <TimeAgo timestamp={item.createdAt} />
                      </div>
                    </div>
                  </>
                );

                const motionProps = {
                  initial: { opacity: 0, scale: 0.95 },
                  animate: { opacity: 1, scale: 1 },
                  exit: { opacity: 0, scale: 0.95 },
                  transition: {
                    ...staggerTransition,
                    delay: index < 5 ? index * 0.03 : 0,
                  },
                };

                return item.taskId ? (
                  <motion.div key={item.id} {...motionProps} role="listitem">
                    <Link
                      href={`/tasks/${item.taskId}`}
                      className="activity-item compact is-clickable transition-all duration-150 border-l-2 border-l-transparent hover:border-l-[var(--accent-primary)] hover:pl-2"
                      aria-label={`${agentLabel}: ${item.message}`}
                    >
                      {content}
                    </Link>
                  </motion.div>
                ) : (
                  <motion.div
                    key={item.id}
                    {...motionProps}
                    className="activity-item compact transition-all duration-150 border-l-2 border-l-transparent hover:border-l-[var(--accent-primary)] hover:pl-2"
                    role="listitem"
                    aria-label={`${agentLabel}: ${item.message}`}
                  >
                    {content}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </section>
  );
});

export default ActivityFeed;
