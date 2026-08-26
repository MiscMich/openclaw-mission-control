"use client";

import { memo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convexApi";
import { MappedIcon } from "@/components/ui";
import { TimeAgo } from "@/components/ui/TimeAgo";

interface ActivityTimelineProps {
  taskId: string;
}

type Activity = {
  id: string;
  type: string;
  message: string;
  agentId?: string;
  taskId?: string;
  createdAt: number;
};

export const ActivityTimeline = memo(function ActivityTimeline({ taskId }: ActivityTimelineProps) {
  const activityResult = useQuery(api.activity.list, {});
  const allActivity = activityResult?.activities as Activity[] | undefined;

  const taskActivity = allActivity?.filter(a => a.taskId === taskId) ?? [];
  const loading = allActivity === undefined;

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "task_created": return "add";
      case "task_assigned": return "user";
      case "task_completed": return "check";
      case "comment_added": return "comment";
      case "task_status_changed": return "refresh";
      case "status_changed": return "refresh";
      case "task_progress": return "activity";
      default: return "activity";
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case "task_created": return "var(--accent-primary)";
      case "task_assigned": return "var(--accent-warning)";
      case "task_completed": return "var(--accent-success)";
      case "task_status_changed": return "var(--accent-info)";
      case "task_progress": return "var(--accent-primary)";
      case "comment_added": return "var(--text-muted)";
      default: return "var(--text-dim)";
    }
  };

  return (
    <div className="activity-timeline">
      {loading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="activity-item-skeleton">
              <div className="skeleton h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-48 rounded" />
                <div className="skeleton h-3 w-24 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : taskActivity.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <MappedIcon name="activity" size="lg" />
          </div>
          <div className="empty-state-title">No activity yet</div>
          <div className="empty-state-text">
            Activity will appear here as the task progresses
          </div>
        </div>
      ) : (
        <div className="activity-list">
          {taskActivity.map((activity, index) => (
            <div key={activity.id} className="activity-item">
              <div
                className="activity-icon"
                style={{ background: getActivityColor(activity.type) }}
              >
                <MappedIcon name={getActivityIcon(activity.type)} size="sm" />
              </div>
              <div className="activity-content">
                <p className="activity-message">{activity.message}</p>
                <TimeAgo timestamp={activity.createdAt} />
              </div>
              {index < taskActivity.length - 1 && <div className="activity-line" />}
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .activity-timeline {
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .activity-list {
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .activity-item {
          position: relative;
          display: flex;
          gap: 16px;
          padding: 16px 0;
        }

        .activity-item:first-child {
          padding-top: 0;
        }

        .activity-icon {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: var(--text-primary);
          z-index: 1;
        }

        .activity-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding-top: 4px;
        }

        .activity-message {
          font-size: 14px;
          color: var(--text-primary);
          margin: 0;
          line-height: 1.5;
        }

        .activity-line {
          position: absolute;
          left: 15px;
          top: 48px;
          bottom: -16px;
          width: 2px;
          background: var(--border-subtle);
        }

        .activity-item:last-child .activity-line {
          display: none;
        }

        .activity-item-skeleton {
          display: flex;
          gap: 16px;
          padding: 16px 0;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 64px 32px;
          text-align: center;
        }

        .empty-state-icon {
          width: 64px;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(139, 92, 246, 0.1);
          border-radius: 50%;
          color: var(--accent-primary);
          margin-bottom: 16px;
        }

        .empty-state-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 8px;
        }

        .empty-state-text {
          font-size: 14px;
          color: var(--text-muted);
          max-width: 300px;
        }

        .skeleton {
          background: linear-gradient(
            90deg,
            var(--bg-elevated) 0%,
            var(--bg-surface) 50%,
            var(--bg-elevated) 100%
          );
          background-size: 200% 100%;
          animation: skeleton-loading 1.5s ease-in-out infinite;
        }

        @keyframes skeleton-loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
});
