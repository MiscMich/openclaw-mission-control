"use client";

import { memo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { MappedIcon } from "@/components/ui";
import { TimeAgo } from "@/components/ui/TimeAgo";
import { cn } from "@/lib/utils";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";

/**
 * Open task with enriched data
 */
type OpenTask = {
  id: string;
  title: string;
  description?: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: string;
  createdAt: number;
  suggestedAssigneeInfo?: {
    id: string;
    name: string;
    emoji: string;
  } | null;
};

interface TaskPoolProps {
  tasks: OpenTask[];
}

/**
 * TaskPool - List of open/unassigned tasks
 */
export const TaskPool = memo(function TaskPool({ tasks }: TaskPoolProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const handleTaskClick = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedTaskId(null);
  }, []);

  if (tasks.length === 0) {
    return (
      <div className="task-pool-empty">
        <div className="empty-icon">
          <MappedIcon name="check" size="lg" />
        </div>
        <p className="empty-text">All tasks claimed!</p>
        <p className="empty-subtext">The swarm is working efficiently</p>

        <style jsx>{`
          .task-pool-empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 300px;
            gap: 12px;
            padding: 40px;
            background: var(--bg-surface);
            border: 1px dashed var(--border-subtle);
            border-radius: var(--radius-lg);
          }

          .empty-icon {
            width: 64px;
            height: 64px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(139, 92, 246, 0.1);
            border-radius: 50%;
            color: var(--accent-primary);
          }

          .empty-text {
            font-size: 16px;
            font-weight: 600;
            color: var(--text-primary);
            margin: 0;
          }

          .empty-subtext {
            font-size: 14px;
            color: var(--text-muted);
            margin: 0;
          }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <div className="task-pool">
        {tasks.map((task, index) => (
          <TaskPoolCard
            key={task.id}
            task={task}
            index={index}
            onTaskClick={handleTaskClick}
          />
        ))}

        <style jsx>{`
        .task-pool {
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow-y: auto;
          padding-right: 8px;
        }
      `}</style>
      </div>
      <TaskDetailModal
        taskId={selectedTaskId}
        open={!!selectedTaskId}
        onClose={handleCloseModal}
      />
    </>
  );
});

// ─── Task Pool Card ───

interface TaskPoolCardProps {
  task: OpenTask;
  index: number;
  onTaskClick: (taskId: string) => void;
}

const TaskPoolCard = memo(function TaskPoolCard({
  task,
  index,
  onTaskClick,
}: TaskPoolCardProps) {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "var(--accent-error)";
      case "high": return "var(--accent-warning)";
      case "normal": return "var(--text-muted)";
      case "low": return "var(--text-dim)";
      default: return "var(--text-muted)";
    }
  };

  // Make card draggable
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? "grabbing" : "grab",
  };

  // Handle click without interfering with drag
  const handleCardClick = useCallback(() => {
    // Only trigger click if we're not dragging
    if (!isDragging) {
      onTaskClick(task.id);
    }
  }, [isDragging, onTaskClick, task.id]);

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={handleCardClick}
      className={cn(
        "task-pool-card",
        `priority-${task.priority}`,
        isDragging && "dragging"
      )}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      transition={{ duration: 0.2, delay: index * 0.02 }}
    >
      {/* Priority Indicator */}
      <div
        className="task-pool-card-indicator"
        style={{ background: getPriorityColor(task.priority) }}
      />

      {/* Content */}
      <div className="task-pool-card-content">
        {/* Header */}
        <div className="task-pool-card-header">
          <h3 className="task-pool-card-title">{task.title}</h3>
          <div
            className={cn("priority-badge", task.priority)}
            style={{ color: getPriorityColor(task.priority) }}
          >
            {task.priority}
          </div>
        </div>

        {/* Description */}
        {task.description && (
          <p className="task-pool-card-description">
            {task.description}
          </p>
        )}

        {/* Footer */}
        <div className="task-pool-card-footer">
          <div className="task-pool-card-time">
            <MappedIcon name="clock" size="sm" />
            <TimeAgo timestamp={task.createdAt} />
          </div>

          {task.suggestedAssigneeInfo && (
            <div className="suggested-assignee">
              <MappedIcon name="robot" size="sm" />
              <span>Suggested: {task.suggestedAssigneeInfo.name}</span>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .task-pool-card {
          position: relative;
          display: flex;
          gap: 0;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          overflow: hidden;
          transition: all 150ms ease;
          cursor: grab;
          touch-action: none;
        }

        .task-pool-card:hover {
          border-color: var(--border-hover);
          background: var(--bg-hover);
          transform: translateX(4px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .task-pool-card.dragging {
          cursor: grabbing;
          opacity: 0.5;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
        }

        .task-pool-card.priority-urgent:hover {
          border-color: var(--accent-error);
        }

        .task-pool-card.priority-high:hover {
          border-color: var(--accent-warning);
        }

        .task-pool-card-indicator {
          width: 4px;
          flex-shrink: 0;
        }

        .task-pool-card-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 16px;
        }

        .task-pool-card-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .task-pool-card-title {
          flex: 1;
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
          line-height: 1.4;
        }

        .priority-badge {
          font-size: 11px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: var(--radius-sm);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          flex-shrink: 0;
          background: rgba(139, 92, 246, 0.1);
        }

        .priority-badge.urgent {
          background: rgba(239, 68, 68, 0.1);
        }

        .priority-badge.high {
          background: rgba(245, 158, 11, 0.1);
        }

        .priority-badge.normal {
          background: var(--bg-elevated);
        }

        .priority-badge.low {
          background: var(--bg-base);
        }

        .task-pool-card-description {
          font-size: 13px;
          color: var(--text-secondary);
          margin: 0;
          line-height: 1.5;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        .task-pool-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: auto;
        }

        .task-pool-card-time {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text-dim);
        }

        .suggested-assignee {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 500;
          color: var(--accent-primary);
          padding: 4px 10px;
          background: rgba(139, 92, 246, 0.1);
          border-radius: var(--radius-sm);
        }
      `}</style>
    </motion.div>
  );
});

export default TaskPool;
