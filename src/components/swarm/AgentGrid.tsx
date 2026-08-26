"use client";

import { memo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { AgentAvatar } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useDroppable } from "@dnd-kit/core";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";

/**
 * Agent with enriched swarm data
 */
type AgentWithTask = {
  id: string;
  name: string;
  role: string;
  status: "idle" | "working" | "offline" | "error";
  currentTask: {
    id: string;
    title: string;
    status: string;
    priority: string;
  } | null;
  workload: number;
};

interface AgentGridProps {
  agents: AgentWithTask[];
  onAgentClick?: (agentId: string) => void;
}

/**
 * AgentGrid - Grid of agent cards showing current tasks
 */
export const AgentGrid = memo(function AgentGrid({ agents, onAgentClick }: AgentGridProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const handleTaskClick = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedTaskId(null);
  }, []);

  if (agents.length === 0) {
    return (
      <div className="agent-grid-empty">
        <p>No agents available</p>
      </div>
    );
  }

  return (
    <>
      <div className="agent-grid">
        {agents.map((agent, index) => (
          <AgentSwarmCard
            key={agent.id}
            agent={agent}
            index={index}
            onTaskClick={handleTaskClick}
            onAgentClick={onAgentClick}
          />
        ))}

        <style jsx>{`
        .agent-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
          overflow-y: auto;
          padding-right: 8px;
        }

        .agent-grid-empty {
          display: flex;
          align-items: center;
          justify-center;
          height: 200px;
          color: var(--text-muted);
          font-size: 14px;
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

// ─── Agent Swarm Card ───

interface AgentSwarmCardProps {
  agent: AgentWithTask;
  index: number;
  onTaskClick: (taskId: string) => void;
  onAgentClick?: (agentId: string) => void;
}

const AgentSwarmCard = memo(function AgentSwarmCard({
  agent,
  index,
  onTaskClick,
  onAgentClick,
}: AgentSwarmCardProps) {

  const isWorking = agent.status === "working";
  const isIdle = agent.status === "idle";

  // Make card droppable
  const { setNodeRef, isOver } = useDroppable({
    id: agent.id,
  });

  // Handle task click
  const handleTaskAreaClick = useCallback((e: React.MouseEvent) => {
    if (agent.currentTask) {
      e.stopPropagation();
      onTaskClick(agent.currentTask.id);
    }
  }, [agent.currentTask, onTaskClick]);

  const handleAgentClick = useCallback(() => {
    onAgentClick?.(agent.id);
  }, [onAgentClick, agent.id]);

  return (
    <motion.div
      ref={setNodeRef}
      className={cn(
        "agent-swarm-card",
        isWorking && "working",
        isIdle && "idle",
        isOver && "drop-target"
      )}
      onClick={handleAgentClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
    >
      {/* Header: Avatar + Name */}
      <div className="agent-swarm-card-header">
        <AgentAvatar
          agentId={agent.id}
          name={agent.name}
          size="lg"
          status={agent.status}
        />
        <div className="agent-swarm-card-info">
          <h3 className="agent-swarm-card-name">{agent.name}</h3>
          <p className="agent-swarm-card-role">{agent.role}</p>
        </div>
      </div>

      {/* Status */}
      <div className="agent-swarm-card-status">
        <div className={cn("status-indicator", agent.status)} />
        <span className="status-text">
          {isWorking ? "Working" : isIdle ? "Idle" : agent.status}
        </span>
        {agent.workload > 0 && (
          <span className="workload-badge">
            {agent.workload} {agent.workload === 1 ? "task" : "tasks"}
          </span>
        )}
      </div>

      {/* Current Task */}
      {agent.currentTask ? (
        <div className="agent-swarm-card-task clickable" onClick={handleTaskAreaClick}>
          <div className="task-label">Current Task</div>
          <div className="task-title">{agent.currentTask.title}</div>
          <div className="task-meta">
            <span className={cn("task-priority", agent.currentTask.priority)}>
              {agent.currentTask.priority}
            </span>
            <span className="task-status">{agent.currentTask.status}</span>
          </div>
        </div>
      ) : (
        <div className="agent-swarm-card-task idle">
          <div className="task-label">Status</div>
          <div className="task-title">Waiting for tasks...</div>
        </div>
      )}

      <style jsx>{`
        .agent-swarm-card {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 20px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          transition: all 150ms ease;
          cursor: pointer;
        }

        .agent-swarm-card:hover {
          border-color: var(--border-hover);
          background: var(--bg-hover);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .agent-swarm-card.working {
          border-color: var(--accent-primary);
          background: linear-gradient(135deg, var(--bg-surface) 0%, rgba(139, 92, 246, 0.05) 100%);
        }

        .agent-swarm-card.drop-target {
          border-color: var(--accent-primary);
          background: rgba(139, 92, 246, 0.1);
          transform: translateY(-4px) scale(1.02);
          box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.3), 0 8px 20px rgba(0, 0, 0, 0.2);
        }

        .agent-swarm-card-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .agent-swarm-card-info {
          flex: 1;
          min-width: 0;
        }

        .agent-swarm-card-name {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .agent-swarm-card-role {
          font-size: 13px;
          color: var(--text-muted);
          margin: 0;
          margin-top: 2px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .agent-swarm-card-status {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: var(--bg-elevated);
          border-radius: var(--radius-md);
        }

        .status-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--text-muted);
        }

        .status-indicator.working {
          background: var(--accent-primary);
          animation: pulse 2s ease-in-out infinite;
        }

        .status-indicator.idle {
          background: var(--text-dim);
        }

        .status-text {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-secondary);
          text-transform: capitalize;
        }

        .workload-badge {
          margin-left: auto;
          font-size: 12px;
          font-weight: 600;
          font-family: var(--font-mono);
          color: var(--accent-primary);
          padding: 2px 8px;
          background: rgba(139, 92, 246, 0.1);
          border-radius: var(--radius-sm);
        }

        .agent-swarm-card-task {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 12px;
          background: var(--bg-base);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
        }

        .agent-swarm-card-task.idle {
          opacity: 0.6;
        }

        .agent-swarm-card-task.clickable {
          cursor: pointer;
          transition: all 150ms ease;
        }

        .agent-swarm-card-task.clickable:hover {
          background: var(--bg-elevated);
          border-color: var(--border-hover);
          transform: translateY(-1px);
        }

        .task-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-dim);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .task-title {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        .task-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 4px;
        }

        .task-priority {
          font-size: 11px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: var(--radius-sm);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .task-priority.urgent {
          color: var(--accent-error);
          background: rgba(239, 68, 68, 0.1);
        }

        .task-priority.high {
          color: var(--accent-warning);
          background: rgba(245, 158, 11, 0.1);
        }

        .task-priority.normal {
          color: var(--text-muted);
          background: var(--bg-elevated);
        }

        .task-priority.low {
          color: var(--text-dim);
          background: var(--bg-elevated);
        }

        .task-status {
          font-size: 12px;
          color: var(--text-muted);
          text-transform: capitalize;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.7;
            transform: scale(1.15);
          }
        }
      `}</style>
    </motion.div>
  );
});

export default AgentGrid;
