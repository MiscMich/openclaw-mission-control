"use client";

import { memo } from "react";
import Link from "next/link";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { TimeAgo } from "@/components/ui/TimeAgo";

type TaskData = {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assigneeName?: string;
  assigneeEmoji?: string;
  assignees?: Array<{ id: string; name: string; emoji: string }>;
  createdAt: number;
  [key: string]: unknown;
};

export const TaskCard = memo(function TaskCard({
  task,
  compact = false,
}: {
  task: TaskData;
  compact?: boolean;
}) {
  const isInProgress = task.status === "in_progress";
  
  return (
    <Link
      href={`/tasks/${task.id}`}
      className={`task-card bg-elevated ${isInProgress ? "in-progress" : ""}`}
      aria-label={`View task: ${task.title}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="task-title truncate" style={{ color: "var(--text-primary)" }}>
            {task.title}
          </div>
          {task.description && !compact && (
            <p className="task-description line-clamp-2" style={{ color: "var(--text-muted)" }}>
              {task.description}
            </p>
          )}
          <div className="task-meta" style={{ color: "var(--text-muted)" }}>
            <span className={`task-status ${task.status}`}>
              {task.status.replace("_", " ")}
            </span>
            {/* Multi-assignee display */}
            {task.assignees && task.assignees.length > 0 ? (
              <div className="flex items-center gap-1">
                <div className="flex -space-x-2">
                  {task.assignees.slice(0, 3).map((assignee) => (
                    <div
                      key={assignee.id}
                      className="assignee-avatar"
                      title={assignee.name}
                      style={{
                        background: "var(--bg-elevated)",
                        border: "2px solid var(--bg-base)",
                      }}
                    >
                      {assignee.emoji}
                    </div>
                  ))}
                </div>
                {task.assignees.length > 3 && (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    +{task.assignees.length - 3}
                  </span>
                )}
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {task.assignees[0].name}
                  {task.assignees.length > 1 && ` +${task.assignees.length - 1}`}
                </span>
              </div>
            ) : task.assigneeName ? (
              <span
                className="flex items-center gap-1 text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                {task.assigneeEmoji} {task.assigneeName}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <PriorityBadge priority={task.priority} />
          <TimeAgo timestamp={task.createdAt} />
        </div>
      </div>
      <style jsx>{`
        .assignee-avatar {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          flex-shrink: 0;
        }
      `}</style>
    </Link>
  );
});
