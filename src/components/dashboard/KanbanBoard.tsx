"use client";

import { memo, useMemo, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/convexApi";
import { toast } from "sonner";
import { PriorityBadge, TaskCardSkeleton, AgentAvatar, Button, Badge } from "@/components/ui";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";
import { isActiveTaskStatus, type TaskStatus } from "@/lib/tasks/status";

type Task = {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: string;
  createdAt?: number;
  updatedAt?: number;
  assigneeId?: string | null;
  assigneeName?: string | null;
  assigneeEmoji?: string | null;
  assigneeIds?: string[];
  assignees?: Array<{ id: string; name: string; emoji: string }>;
};

type ColumnId = "inbox" | "assigned" | "in_progress" | "review" | "done" | "blocked";
type QuickFilter = "all" | "review" | "unclaimed" | "high_priority" | "active";

const COLUMNS: Array<{ id: ColumnId; title: string }> = [
  { id: "inbox", title: "Inbox" },
  { id: "assigned", title: "Assigned" },
  { id: "in_progress", title: "In Progress" },
  { id: "review", title: "Review" },
  { id: "done", title: "Done" },
  { id: "blocked", title: "Blocked" },
];

// Geist-palette column colors
const COLUMN_COLORS: Record<ColumnId, string> = {
  inbox: "#555555",
  assigned: "#f5a623",
  in_progress: "#0070f3",
  review: "#7c3aed",
  done: "#46a758",
  blocked: "#e5484d",
};

function normalizeStatus(status: TaskStatus): ColumnId | null {
  if (status === "open") return "inbox";
  if (status === "completed") return "done";
  if (status === "failed" || status === "cancelled") return null;
  return status as ColumnId;
}

// Priority order for sorting pending tasks
const PRIORITY_ORDER: Record<string, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

const HIGH_PRIORITY_VALUES = new Set(["high", "urgent"]);
const QUICK_FILTER_LABELS: Array<{ id: QuickFilter; label: string }> = [
  { id: "all", label: "All Tasks" },
  { id: "review", label: "Review" },
  { id: "unclaimed", label: "Unclaimed" },
  { id: "high_priority", label: "High Priority" },
  { id: "active", label: "Active" },
];

function normalizeTasksFilterParam(value: string | null): QuickFilter {
  if (value === "review") return "review";
  if (value === "unclaimed") return "unclaimed";
  if (value === "high_priority") return "high_priority";
  if (value === "active") return "active";
  return "all";
}

function isArchivedTaskStatus(status: TaskStatus) {
  return status === "failed" || status === "cancelled";
}

function formatTaskTimestamp(timestamp?: number) {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return "unknown time";
  }
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function useColumnTasks(
  tasks: Task[] | undefined,
  agentFilter: string | null,
  quickFilter: QuickFilter
) {
  return useMemo(() => {
    const byStatus: Record<ColumnId, Task[]> = {
      inbox: [],
      assigned: [],
      in_progress: [],
      review: [],
      done: [],
      blocked: [],
    };

    if (!tasks || !Array.isArray(tasks)) return byStatus;

    // Filter by agent if filter is active
    let filteredTasks = agentFilter
      ? tasks.filter((task) => task.assigneeIds?.includes(agentFilter))
      : tasks;

    if (quickFilter === "review") {
      filteredTasks = filteredTasks.filter((task) => task.status === "review");
    }

    if (quickFilter === "unclaimed") {
      filteredTasks = filteredTasks.filter(
        (task) => !task.assigneeIds || task.assigneeIds.length === 0
      );
    }

    if (quickFilter === "high_priority") {
      filteredTasks = filteredTasks.filter((task) =>
        HIGH_PRIORITY_VALUES.has(task.priority)
      );
    }

    if (quickFilter === "active") {
      filteredTasks = filteredTasks.filter((task) =>
        isActiveTaskStatus(task.status)
      );
    }

    for (const task of filteredTasks) {
      const normalized = normalizeStatus(task.status);
      if (normalized && normalized in byStatus) {
        byStatus[normalized].push(task);
      }
    }

    // Sort inbox/pending by priority (urgent > high > normal > low)
    byStatus.inbox.sort((a, b) => {
      const priorityA = PRIORITY_ORDER[a.priority] ?? 2;
      const priorityB = PRIORITY_ORDER[b.priority] ?? 2;
      return priorityB - priorityA;
    });

    return byStatus;
  }, [tasks, agentFilter, quickFilter]);
}

// =============================================================================
// ANIMATION CONFIG (hoisted outside per rendering-hoist-jsx rule)
// =============================================================================

const cardTransition = {
  duration: 0.25,
  layout: { duration: 0.25 },
};

const liveIndicatorAnimation = {
  initial: { opacity: 0, scale: 0.8 },
  animate: { opacity: 1, scale: 1 },
  transition: { duration: 0.2 },
};

// =============================================================================
// TASK CARD (Memoized per rerender-memo rule)
// =============================================================================

interface TaskCardProps {
  task: Task;
  columnId: ColumnId;
  dragOverlay?: boolean;
  onAgentClick?: (agentId: string) => void;
  onClaim?: (taskId: string) => void;
  onCardClick?: (taskId: string) => void;
  onUpdateStatus?: (args: { id: string; status: TaskStatus }) => Promise<unknown>;
}

const TaskCard = memo(function TaskCard({
  task,
  columnId,
  dragOverlay = false,
  onAgentClick,
  onClaim,
  onCardClick,
  onUpdateStatus,
}: TaskCardProps) {
  const isLive = task.status === "in_progress";
  const isPending = columnId === "inbox";
  const hasAssignees = task.assignees && task.assignees.length > 0;
  const isUnclaimed = !hasAssignees && (task.status === "open" || task.status === "inbox");
  const needsApproval = (task.status === "review" || columnId === "review") && !dragOverlay;
  const [isApproving, setIsApproving] = useState(false);
  const [isRequestingChanges, setIsRequestingChanges] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { columnId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const dragProps = dragOverlay ? {} : { ...attributes, ...listeners };

  const handleAgentClick = useCallback(
    (e: React.MouseEvent, agentId: string) => {
      e.stopPropagation();
      onAgentClick?.(agentId);
    },
    [onAgentClick]
  );

  const handleClaim = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onClaim?.(task.id);
    },
    [onClaim, task.id]
  );

  const handleCardClick = useCallback(() => {
    if (!dragOverlay) {
      onCardClick?.(task.id);
    }
  }, [dragOverlay, onCardClick, task.id]);

  const stopCardInteraction = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
    // Prevent DnD sensor activation and avoid triggering card open.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e as any).preventDefault?.();
  }, []);

  const handleApprove = useCallback(
    async (e: React.MouseEvent) => {
      stopCardInteraction(e);
      if (!onUpdateStatus || isApproving || isRequestingChanges) return;
      setIsApproving(true);
      try {
        await onUpdateStatus({ id: task.id, status: "done" });
        toast.success("Task approved", {
          description: task.title ? `"${task.title}" marked as done` : "Task marked as done",
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        toast.error("Failed to approve task", { description: errorMessage });
      } finally {
        setIsApproving(false);
      }
    },
    [isApproving, isRequestingChanges, onUpdateStatus, stopCardInteraction, task.id, task.title]
  );

  const handleRequestChanges = useCallback(
    async (e: React.MouseEvent) => {
      stopCardInteraction(e);
      if (!onUpdateStatus || isApproving || isRequestingChanges) return;
      setIsRequestingChanges(true);
      try {
        await onUpdateStatus({ id: task.id, status: "in_progress" });
        toast.success("Changes requested", {
          description: task.title
            ? `"${task.title}" moved back to in progress`
            : "Task moved back to in progress",
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        toast.error("Failed to request changes", { description: errorMessage });
      } finally {
        setIsRequestingChanges(false);
      }
    },
    [isApproving, isRequestingChanges, onUpdateStatus, stopCardInteraction, task.id, task.title]
  );

  const cardStyle = {
    ...style,
    cursor: dragOverlay ? "grabbing" : isDragging ? "grabbing" : "pointer",
  };

  return (
    <motion.div
      ref={dragOverlay ? undefined : setNodeRef}
      style={cardStyle}
      {...dragProps}
      layout
      initial={dragOverlay ? false : { opacity: 0, scale: 0.95 }}
      animate={{
        opacity: isDragging ? 0.5 : 1,
        scale: isDragging ? 0.98 : 1,
      }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={cardTransition}
      whileHover={!isDragging ? {
        y: -2,
        boxShadow: "0 8px 20px rgba(0, 0, 0, 0.25)"
      } : {}}
        onClick={handleCardClick}
        className={`
          task-card
          cursor-pointer hover:scale-[1.01] hover:shadow-lg transition-all duration-150
          ${isDragging ? "dragging" : ""}
          ${dragOverlay ? "drag-overlay" : ""}
        `}
        role="article"
        aria-label={`Task: ${task.title}`}
      >
      <div className="task-card-content">
        <div className="flex items-start justify-between gap-2">
          {dragOverlay ? (
            <span className="task-title">{task.title}</span>
          ) : (
            <span className="task-title flex-1">{task.title}</span>
          )}

          {/* Needs approval badge */}
          {needsApproval && (
            <Badge
              variant="secondary"
              style={{
                fontSize: "9px",
                padding: "2px 6px",
                height: "18px",
                textTransform: "uppercase",
                letterSpacing: "0.03em",
              }}
            >
              Needs approval
            </Badge>
          )}

          {/* Unclaimed badge */}
          {isUnclaimed && !dragOverlay && (
            <Badge
              variant="secondary"
              style={{
                fontSize: "9px",
                padding: "2px 6px",
                height: "18px",
                textTransform: "uppercase",
                letterSpacing: "0.03em",
              }}
            >
              Unclaimed
            </Badge>
          )}
        </div>

        <div className="task-meta">
          <PriorityBadge
            priority={task.priority as "urgent" | "high" | "normal" | "low"}
            size="sm"
          />

          <div className="flex items-center gap-2" style={{ marginLeft: "auto" }}>
            {/* Agent avatars (clickable for filtering) */}
            {hasAssignees && !dragOverlay && (
              <div className="flex items-center gap-1">
                {task.assignees!.slice(0, 3).map((agent) => (
                  <div
                    key={agent.id}
                    onClick={(e) => handleAgentClick(e, agent.id)}
                    className="cursor-pointer hover:scale-110 transition-transform"
                    title={agent.name}
                  >
                    <AgentAvatar agentId={agent.id} name={agent.name} size="sm" />
                  </div>
                ))}
                {task.assignees!.length > 3 && (
                  <div
                    className="text-xs text-[var(--text-dim)] ml-1"
                    style={{ fontSize: "10px" }}
                  >
                    +{task.assignees!.length - 3}
                  </div>
                )}
              </div>
            )}

            {/* Review actions */}
            {needsApproval && (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onPointerDown={stopCardInteraction}
                  onClick={handleApprove}
                  disabled={isApproving || isRequestingChanges}
                  style={{
                    fontSize: "11px",
                    padding: "4px 10px",
                    height: "24px",
                  }}
                >
                  Approve
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onPointerDown={stopCardInteraction}
                  onClick={handleRequestChanges}
                  disabled={isApproving || isRequestingChanges}
                  style={{
                    fontSize: "11px",
                    padding: "4px 10px",
                    height: "24px",
                  }}
                >
                  Request changes
                </Button>
              </div>
            )}

            {/* Claim button for pending tasks */}
            {isPending && !dragOverlay && (
              <Button
                variant="secondary"
                size="sm"
                onPointerDown={stopCardInteraction}
                onClick={handleClaim}
                style={{
                  fontSize: "11px",
                  padding: "4px 10px",
                  height: "24px",
                }}
              >
                Claim
              </Button>
            )}
          </div>
        </div>
      </div>

      {isLive && (
        <motion.div
          className="task-live-indicator"
          {...liveIndicatorAnimation}
          aria-label="Task in progress"
        >
          <span className="live-dot" aria-hidden="true" />
          <span className="live-text">LIVE</span>
        </motion.div>
      )}
    </motion.div>
  );
});

// =============================================================================
// COLUMN (Memoized per rerender-memo rule)
// =============================================================================

interface ColumnProps {
  id: ColumnId;
  title: string;
  tasks: Task[];
  isLoading: boolean;
  onAgentClick?: (agentId: string) => void;
  onClaim?: (taskId: string) => void;
  onCardClick?: (taskId: string) => void;
  onUpdateStatus?: (args: { id: string; status: TaskStatus }) => Promise<unknown>;
}

const Column = memo(function Column({
  id,
  title,
  tasks,
  isLoading,
  onAgentClick,
  onClaim,
  onCardClick,
  onUpdateStatus,
}: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { columnId: id },
  });

  const color = COLUMN_COLORS[id];

  // Memoize task IDs for SortableContext (per rerender-memo rule)
  const taskIds = useMemo(() => tasks.map((task) => task.id), [tasks]);

  return (
    <motion.div
      ref={setNodeRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`kanban-column ${isOver ? "drag-over" : ""}`}
      style={{
        "--column-color": color,
        "--column-glow": `${color}30`,
      } as React.CSSProperties}
      role="region"
      aria-label={`${title} column with ${tasks.length} tasks`}
    >
      <div className="column-header">
        <motion.span
          className="column-dot"
          style={{ background: color }}
          animate={isOver ? { scale: 1.3 } : { scale: 1 }}
          transition={{ duration: 0.15 }}
          aria-hidden="true"
        />
        <span className="column-title">{title}</span>
        <motion.span
          className="column-count"
          key={tasks.length}
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          aria-label={`${tasks.length} tasks`}
        >
          {tasks.length}
        </motion.span>
      </div>

      <div
        className="column-body"
        role="list"
        aria-label={`${title} tasks`}
      >
        {isLoading ? (
          <div className="column-loading" aria-busy="true" aria-label="Loading tasks">
            <TaskCardSkeleton count={3} />
          </div>
        ) : tasks.length === 0 ? (
          <motion.div
            className={`column-empty-state ${isOver ? "drop-ready" : ""}`}
            animate={isOver ? { scale: 1.02 } : { scale: 1 }}
            transition={{ duration: 0.15 }}
          >
            <div className="empty-drop-zone">
              <motion.span
                className="empty-drop-icon"
                animate={isOver ? { y: 4, opacity: 1 } : { y: 0, opacity: 0.5 }}
                transition={{ duration: 0.15 }}
                aria-hidden="true"
              >
                {isOver ? "⬇" : "◇"}
              </motion.span>
              <span className="empty-drop-text">
                {isOver ? "Release to drop" : "Empty"}
              </span>
            </div>
          </motion.div>
        ) : (
          <SortableContext
            id={id}
            items={taskIds}
            strategy={verticalListSortingStrategy}
          >
            <AnimatePresence mode="popLayout">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  columnId={id}
                  onAgentClick={onAgentClick}
                  onClaim={onClaim}
                  onCardClick={onCardClick}
                  onUpdateStatus={onUpdateStatus}
                />
              ))}
            </AnimatePresence>
          </SortableContext>
        )}
      </div>
    </motion.div>
  );
});

// =============================================================================
// DROP ANIMATION CONFIG (hoisted outside per rendering-hoist-jsx rule)
// =============================================================================

const dropAnimationConfig = {
  duration: 200,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const KanbanBoard = memo(function KanbanBoard() {
  const tasksResult = useQuery(api.tasks.list, {});
  const tasks = tasksResult?.tasks as Task[] | undefined;
  const agents = useQuery(api.agents.list, {});
  const updateStatus = useMutation(api.tasks.updateStatus);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [showArchivedTasks, setShowArchivedTasks] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Keep quick filter in sync with URL param so StatsBar can deep-link into Review.
  const tasksFilterParam = searchParams.get("tasksFilter");
  useEffect(() => {
    const next = normalizeTasksFilterParam(tasksFilterParam);
    setQuickFilter((current) => (current === next ? current : next));
  }, [tasksFilterParam]);

  const pushTasksFilterParam = useCallback(
    (next: QuickFilter) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "all") params.delete("tasksFilter");
      else params.set("tasksFilter", next);
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const columnTasks = useColumnTasks(tasks, agentFilter, quickFilter);
  const activeTask = useMemo(
    () => tasks?.find((task) => task.id === activeId) ?? null,
    [tasks, activeId]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  // Stable drag handlers (per rerender-functional-setstate rule)
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over) {
        setActiveId(null);
        return;
      }

      const activeColumn = active.data.current?.columnId as ColumnId | undefined;
      const overColumn =
        (over.data.current?.columnId as ColumnId | undefined) ||
        (COLUMNS.some((column) => column.id === over.id)
          ? (over.id as ColumnId)
          : undefined);

      if (!activeColumn || !overColumn || activeColumn === overColumn) {
        setActiveId(null);
        return;
      }

      const draggedTask = tasks?.find((task) => task.id === (active.id as string));
      const hasAssignee = Boolean(
        draggedTask &&
          ((draggedTask.assigneeIds && draggedTask.assigneeIds.length > 0) ||
            draggedTask.assigneeId)
      );

      if ((overColumn === "assigned" || overColumn === "in_progress") && !hasAssignee) {
        setActiveId(null);
        toast.error("Assign this task to an agent first", {
          description: "Use Claim to assign and dispatch the task.",
        });
        return;
      }

      try {
        await updateStatus({ id: active.id as string, status: overColumn });
        const destinationTitle =
          COLUMNS.find((column) => column.id === overColumn)?.title ?? overColumn;
        toast.success("Task status updated", {
          description: draggedTask?.title
            ? `"${draggedTask.title}" → ${destinationTitle}`
            : `Moved to ${destinationTitle}`,
        });
        setActiveId(null);
      } catch (error) {
        setActiveId(null);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        toast.error("Failed to move task", { description: errorMessage });
      }
    },
    [tasks, updateStatus]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const handleAgentClick = useCallback((agentId: string) => {
    setAgentFilter((current) => (current === agentId ? null : agentId));
  }, []);

  const handleClaim = useCallback(
    async (taskId: string) => {
      const preferredAgentId =
        agentFilter ??
        agents?.find((agent) => agent.id === "coordinator")?.id ??
        agents?.find((agent) => agent.status === "working")?.id ??
        agents?.[0]?.id;

      if (!preferredAgentId) {
        toast.error("No agents available to claim this task");
        return;
      }

      try {
        const claimResponse = await fetch("/api/tasks/claim", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ taskId, agentId: preferredAgentId }),
        });

        if (!claimResponse.ok) {
          const payload = (await claimResponse.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || "Failed to claim task");
        }

        const claimedTask = tasks?.find((task) => task.id === taskId);
        const assigneeName =
          agents?.find((a) => a.id === preferredAgentId)?.name ?? preferredAgentId;
        let spawnError: string | null = null;

        if (claimedTask) {
          try {
            const spawnResponse = await fetch("/api/agents/spawn", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                agentId: preferredAgentId,
                taskId,
                prompt: `Start task: ${claimedTask.title}${
                  claimedTask.description
                    ? `\n\nDetails:\n${claimedTask.description}`
                    : ""
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
          toast.success("Task claimed", {
            description: `Assigned to ${assigneeName}`,
          });
          toast.error("Auto-start failed", { description: spawnError });
        } else {
          toast.success("Task claimed", {
            description: `Assigned to ${assigneeName} and started a session`,
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        toast.error("Failed to claim task", { description: errorMessage });
      }
    },
    [agents, agentFilter, tasks]
  );

  const handleClearFilter = useCallback(() => {
    setAgentFilter(null);
  }, []);

  const handleCardClick = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedTaskId(null);
  }, []);

  // Derive isLoading from tasks (per rerender-derived-state rule)
  const isLoading = tasks === undefined;

  // Get filtered agent name for display
  const filteredAgent = useMemo(
    () => agents?.find((a) => a.id === agentFilter),
    [agents, agentFilter]
  );
  const quickFilterCounts = useMemo<Record<QuickFilter, number>>(() => {
    const source = tasks ?? [];
    const boardVisible = source.filter((task) => normalizeStatus(task.status) !== null);

    return {
      all: boardVisible.length,
      review: boardVisible.filter((task) => task.status === "review").length,
      unclaimed: boardVisible.filter(
        (task) => !task.assigneeIds || task.assigneeIds.length === 0
      ).length,
      high_priority: boardVisible.filter((task) =>
        HIGH_PRIORITY_VALUES.has(task.priority)
      ).length,
      active: boardVisible.filter((task) => isActiveTaskStatus(task.status)).length,
    };
  }, [tasks]);

  const totalTasks = tasks?.length ?? 0;
  const archivedTaskCount = Math.max(totalTasks - quickFilterCounts.all, 0);
  const archivedTasks = useMemo(() => {
    const source = tasks ?? [];
    return source
      .filter((task) => isArchivedTaskStatus(task.status))
      .sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0));
  }, [tasks]);
  const activeQueueTasks = useMemo(() => {
    const source = tasks ?? [];
    return source.filter((task) => isActiveTaskStatus(task.status));
  }, [tasks]);

  const handleQuickFilterChange = useCallback((value: QuickFilter) => {
    const next = quickFilter === value ? "all" : value;
    setQuickFilter(next);
    pushTasksFilterParam(next);
  }, [pushTasksFilterParam, quickFilter]);

  const handleRestoreArchivedTask = useCallback(
    async (taskId: string) => {
      try {
        await updateStatus({ id: taskId, status: "inbox" });
        toast.success("Task moved back to Inbox");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        toast.error("Failed to requeue task", { description: errorMessage });
      }
    },
    [updateStatus]
  );

  return (
    <>
      <div className="flex flex-col h-full min-h-0">
        {/* Agent filter bar */}
        {agentFilter && filteredAgent && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-3 px-4 py-3 mb-2 rounded-lg"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div className="flex items-center gap-2 flex-1">
              <AgentAvatar agentId={agentFilter} name={filteredAgent.name} size="sm" />
              <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                Filtering by {filteredAgent.name}
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleClearFilter}>
              Clear filter
            </Button>
          </motion.div>
        )}

        <div
          className="flex flex-wrap items-center gap-2 px-4 py-3 mb-2 rounded-lg"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {QUICK_FILTER_LABELS.map((filter) => {
            const active = quickFilter === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => handleQuickFilterChange(filter.id)}
                className="btn btn-sm"
                style={{
                  background: active ? "var(--accent-primary)" : "var(--bg-surface)",
                  border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                  color: active ? "var(--bg-base)" : "var(--text-muted)",
                }}
                aria-pressed={active}
              >
                {filter.label}
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 11,
                    opacity: active ? 0.9 : 0.75,
                  }}
                >
                  {quickFilterCounts[filter.id]}
                </span>
              </button>
            );
          })}
        </div>

        {!isLoading && (
          <div
            className="px-4 py-3 mb-2 rounded-lg"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div
              className="flex flex-wrap items-center gap-2 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              <span>
                <strong style={{ color: "var(--text-primary)" }}>
                  {activeQueueTasks.length}
                </strong>{" "}
                active queue task{activeQueueTasks.length === 1 ? "" : "s"}
              </span>
              {activeQueueTasks.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  {activeQueueTasks.slice(0, 4).map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      className="btn btn-sm"
                      onClick={() => handleCardClick(task.id)}
                      style={{
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-subtle)",
                        color: "var(--text-secondary)",
                        maxWidth: "320px",
                      }}
                      title={task.title}
                    >
                      <span className="truncate">
                        {(task.assignees?.[0]?.name ?? task.assigneeName ?? task.assigneeId ?? "Unassigned")}:
                        {" "}
                        {task.title}
                      </span>
                    </button>
                  ))}
                </>
              )}
              {activeQueueTasks.length === 0 && (
                <span>No tasks are actively assigned/in-progress/review right now.</span>
              )}
            </div>
          </div>
        )}

        {!isLoading && archivedTaskCount > 0 && (
          <div
            className="px-4 py-2 mb-2 rounded-lg text-xs"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-muted)",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {quickFilterCounts.all === 0
                  ? `All ${totalTasks} tasks are archived (cancelled/failed), so the board is empty.`
                  : `${totalTasks} total tasks · ${archivedTaskCount} archived (cancelled/failed) hidden from board.`}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowArchivedTasks((current) => !current)}
              >
                {showArchivedTasks ? "Hide archived list" : "View archived list"}
              </Button>
            </div>
            {showArchivedTasks && (
              <div
                className="mt-3 max-h-56 overflow-y-auto space-y-2 pr-1"
                role="list"
                aria-label="Archived tasks"
              >
                {archivedTasks.slice(0, 24).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 rounded-md px-2 py-2"
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-subtle)",
                    }}
                    role="listitem"
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate text-xs font-medium"
                        style={{ color: "var(--text-secondary)" }}
                        title={task.title}
                      >
                        {task.title}
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>
                        {task.status} · {formatTaskTimestamp(task.updatedAt ?? task.createdAt)}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRestoreArchivedTask(task.id)}
                    >
                      Requeue
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="flex-1 min-h-0">
            <div className="kanban-board" role="group" aria-label="Kanban board">
              {COLUMNS.map((column) => (
                <Column
                  key={column.id}
                  id={column.id}
                  title={column.title}
                  tasks={columnTasks[column.id]}
                  isLoading={isLoading}
                  onAgentClick={handleAgentClick}
                  onClaim={handleClaim}
                  onCardClick={handleCardClick}
                  onUpdateStatus={updateStatus}
                />
              ))}
            </div>
          </div>

          <DragOverlay dropAnimation={dropAnimationConfig}>
            {activeTask ? (
              <TaskCard
                task={activeTask}
                columnId={normalizeStatus(activeTask.status) ?? "inbox"}
                dragOverlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Task Detail Modal */}
      <TaskDetailModal
        taskId={selectedTaskId}
        open={isModalOpen}
        onClose={handleCloseModal}
      />
    </>
  );
});

export default KanbanBoard;
