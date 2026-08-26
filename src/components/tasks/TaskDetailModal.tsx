"use client";

import { memo, useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/lib/convexApi";
import { toast } from "sonner";
import { TaskSessionTranscript } from "./TaskSessionTranscript";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  ConfirmDialog,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Input,
  Textarea,
  Select,
  Button,
  PriorityBadge,
  StatusBadge,
  MappedIcon,
  KineticNumber,
} from "@/components/ui";
import { CommentThread } from "./CommentThread";
import { ActivityTimeline } from "./ActivityTimeline";
import {
  TASK_STATUS_VALUES,
  isTaskStatus,
  type TaskStatus,
} from "@/lib/tasks/status";

const LiveTerminal = dynamic(
  () => import("@/components/dashboard/LiveTerminal").then((m) => m.LiveTerminal),
  { ssr: false }
);

interface TaskDetailModalProps {
  taskId: string | null;
  open: boolean;
  onClose: () => void;
}

type TaskPriority = "low" | "normal" | "high" | "urgent";

type Task = {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  requiresApproval?: boolean;
  priority: TaskPriority;
  assigneeId?: string;
  assigneeIds?: string[];
  assigneeName?: string | null;
  assignees?: Array<{ id: string; name: string; emoji: string }>;
  createdAt: number;
  updatedAt: number;
  sessionKey?: string;
  output?: string;
  tokensUsed?: number;
  costUsd?: number;
};

function isTaskPriority(value: string): value is TaskPriority {
  return ["low", "normal", "high", "urgent"].includes(value);
}

function parseSessionId(sessionKey?: string): string | undefined {
  if (!sessionKey) return undefined;
  const parts = sessionKey.split(":").filter(Boolean);
  if (parts.length >= 3) return parts[parts.length - 1];
  return sessionKey;
}

function parseSessionAgentId(sessionKey?: string): string | undefined {
  if (!sessionKey) return undefined;
  const parts = sessionKey.split(":").filter(Boolean);
  if (parts.length >= 2 && parts[0] === "agent") return parts[1];
  return undefined;
}

export const TaskDetailModal = memo(function TaskDetailModal({
  taskId,
  open,
  onClose,
}: TaskDetailModalProps) {
  const router = useRouter();
  const task = useQuery(api.tasks.getById, taskId ? { id: taskId } : "skip") as Task | null | undefined;
  const updateTask = useMutation(api.tasks.update);
  const updateStatus = useMutation(api.tasks.updateStatus);
  const createComment = useMutation(api.comments.create);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<TaskStatus>("open");
  const [editPriority, setEditPriority] = useState<TaskPriority>("normal");
  const [commentText, setCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [isRedispatching, setIsRedispatching] = useState(false);
  const [redispatchConfirmOpen, setRedispatchConfirmOpen] = useState(false);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [isUpdatingRequiresApproval, setIsUpdatingRequiresApproval] =
    useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRequestingChanges, setIsRequestingChanges] = useState(false);
  const sessionId = parseSessionId(task?.sessionKey);
  const sessionAgentId = parseSessionAgentId(task?.sessionKey);
  const primaryAssigneeId = task?.assigneeIds?.[0] ?? task?.assigneeId;

  useEffect(() => {
    if (!task) return;
    setRequiresApproval(task.requiresApproval ?? false);
  }, [task?.requiresApproval, task?.id]);

  const handleEdit = useCallback(() => {
    if (task) {
      setEditTitle(task.title);
      setEditDescription(task.description ?? "");
      setEditStatus(task.status);
      setEditPriority(task.priority);
      setIsEditing(true);
    }
  }, [task]);

  const handleSave = useCallback(async () => {
    if (!taskId) return;
    setIsSubmitting(true);
    try {
      await updateTask({
        id: taskId,
        title: editTitle,
        description: editDescription,
        status: editStatus,
        priority: editPriority,
      });
      toast.success("Task updated");
      setIsEditing(false);
    } catch (error) {
      toast.error("Failed to update task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [taskId, editTitle, editDescription, editStatus, editPriority, updateTask]);

  const handleSaveClick = useCallback(() => {
    if (task && editStatus === "cancelled" && task.status !== "cancelled") {
      setCancelConfirmOpen(true);
      return;
    }
    void handleSave();
  }, [editStatus, handleSave, task]);

  const handleRequiresApprovalChange = useCallback(
    async (nextValue: boolean) => {
      if (!taskId || !task || isUpdatingRequiresApproval) return;
      const previousValue = requiresApproval;
      setRequiresApproval(nextValue);
      setIsUpdatingRequiresApproval(true);
      try {
        await updateTask({ id: taskId, requiresApproval: nextValue });
        toast.success("Approval requirement updated", {
          description: nextValue
            ? "This task will move to Review when agents post done."
            : "Agents can mark this task done directly.",
        });
      } catch (error) {
        setRequiresApproval(previousValue);
        toast.error("Failed to update approval requirement", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setIsUpdatingRequiresApproval(false);
      }
    },
    [
      isUpdatingRequiresApproval,
      requiresApproval,
      task,
      taskId,
      updateTask,
    ]
  );

  const handleApprove = useCallback(async () => {
    if (!taskId || !task || isApproving || isRequestingChanges) return;
    setIsApproving(true);
    try {
      await updateStatus({ id: taskId, status: "done" });
      toast.success("Task approved", {
        description: `"${task.title}" marked as done`,
      });
    } catch (error) {
      toast.error("Failed to approve task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsApproving(false);
    }
  }, [isApproving, isRequestingChanges, task, taskId, updateStatus]);

  const handleRequestChanges = useCallback(async () => {
    if (!taskId || !task || isApproving || isRequestingChanges) return;
    setIsRequestingChanges(true);
    try {
      await updateStatus({ id: taskId, status: "in_progress" });
      toast.success("Changes requested", {
        description: `"${task.title}" moved back to in progress`,
      });
    } catch (error) {
      toast.error("Failed to request changes", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsRequestingChanges(false);
    }
  }, [isApproving, isRequestingChanges, task, taskId, updateStatus]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleCommentSubmit = useCallback(async () => {
    if (!taskId || !commentText.trim()) return;
    setIsSubmitting(true);
    try {
      await createComment({
        taskId,
        authorId: "operator",
        authorName: "Operator",
        content: commentText,
      });
      setCommentText("");
      toast.success("Comment added");
    } catch (error) {
      toast.error("Failed to add comment", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [taskId, commentText, createComment]);

  const spawnFreshSession = useCallback(
    async (previousSessionKey?: string) => {
      if (!taskId || !task || isRedispatching) return;

      if (!primaryAssigneeId) {
        toast.error("Assign an agent before starting a session");
        return;
      }

      setIsRedispatching(true);
      try {
        const prompt = `Start task: ${task.title}${
          task.description ? `\n\nDetails:\n${task.description}` : ""
        }${
          previousSessionKey
            ? `\n\nNote: retrying previous session ${previousSessionKey}`
            : ""
        }`;

        const spawnResponse = await fetch("/api/agents/spawn", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            agentId: primaryAssigneeId,
            taskId,
            prompt,
          }),
        });

        const payload = (await spawnResponse.json().catch(() => null)) as
          | { success?: boolean; error?: string; sessionKey?: string }
          | null;

        if (!spawnResponse.ok || !payload?.success) {
          throw new Error(payload?.error || "Failed to start session");
        }

        toast.success("New session started", {
          description: payload.sessionKey
            ? `Linked session: ${payload.sessionKey}`
            : "A new session was started for this task",
        });
      } catch (error) {
        toast.error("Failed to start a new session", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setIsRedispatching(false);
      }
    },
    [isRedispatching, primaryAssigneeId, task, taskId]
  );

  const handleRedispatchClick = useCallback(() => {
    if (!task || isRedispatching) return;

    if (!primaryAssigneeId) {
      toast.error("Assign an agent before starting a session");
      return;
    }

    if (task.sessionKey) {
      setRedispatchConfirmOpen(true);
      return;
    }

    void spawnFreshSession();
  }, [isRedispatching, primaryAssigneeId, spawnFreshSession, task]);

  if (!taskId) return null;

  const statusOptions: Array<{ value: TaskStatus; label: string }> = TASK_STATUS_VALUES.map(
    (value) => ({
      value,
      label:
        value === "in_progress"
          ? "In Progress"
          : value.charAt(0).toUpperCase() + value.slice(1).replace("_", " "),
    })
  );

  const priorityOptions: Array<{ value: TaskPriority; label: string }> = [
    { value: "low", label: "Low" },
    { value: "normal", label: "Normal" },
    { value: "high", label: "High" },
    { value: "urgent", label: "Urgent" },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="task-detail-modal">
        {task === undefined ? (
          <>
            <DialogHeader>
              <DialogTitle className="sr-only">Task details</DialogTitle>
            </DialogHeader>
            <div className="loading-state">
              <div className="skeleton h-8 w-64 rounded mb-4" />
              <div className="skeleton h-4 w-full rounded mb-2" />
              <div className="skeleton h-4 w-3/4 rounded mb-4" />
              <div className="skeleton h-64 w-full rounded" />
            </div>
          </>
        ) : !task ? (
          <>
            <DialogHeader>
              <DialogTitle className="sr-only">Task details</DialogTitle>
            </DialogHeader>
            <div className="error-state">
              <MappedIcon name="error" size="lg" />
              <p>Task not found</p>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              {isEditing ? (
                <DialogTitle className="sr-only">{task.title}</DialogTitle>
              ) : null}
              <div className="task-header">
                {isEditing ? (
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Task title"
                    size="lg"
                  />
                ) : (
                  <DialogTitle className="task-title">{task.title}</DialogTitle>
                )}
                <div className="task-badges">
                  <StatusBadge status={task.status} />
                  <PriorityBadge priority={task.priority} />
                  {!isEditing && task.status === "review" && (
                    <>
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => {
                          void handleApprove();
                        }}
                        loading={isApproving}
                        disabled={isRequestingChanges}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          void handleRequestChanges();
                        }}
                        loading={isRequestingChanges}
                        disabled={isApproving}
                      >
                        Request changes
                      </Button>
                    </>
                  )}
                  {!isEditing && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="Edit"
                      onClick={handleEdit}
                    >
                      Edit
                    </Button>
                  )}
                </div>
              </div>
            </DialogHeader>

            <div className="task-content">
              <Tabs defaultValue="details" className="task-tabs">
                <TabsList>
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="comments">Comments</TabsTrigger>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                  <TabsTrigger value="terminal">Session Stream</TabsTrigger>
                  <TabsTrigger value="transcript">Transcript</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="tab-panel">
                  {isEditing ? (
                    <div className="edit-form">
                      <div className="form-row">
                        <Select
                          label="Status"
                          value={editStatus}
                          options={statusOptions}
                          onChange={(e) => {
                            if (isTaskStatus(e.target.value)) {
                              setEditStatus(e.target.value);
                            }
                          }}
                        />
                        <Select
                          label="Priority"
                          value={editPriority}
                          options={priorityOptions}
                          onChange={(e) => {
                            if (isTaskPriority(e.target.value)) {
                              setEditPriority(e.target.value);
                            }
                          }}
                        />
                      </div>
                      <Textarea
                        label="Description"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="Add a description..."
                        rows={8}
                      />
                      <div className="edit-actions">
                        <Button
                          variant="secondary"
                          onClick={handleCancelEdit}
                          disabled={isSubmitting}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="primary"
                          onClick={handleSaveClick}
                          loading={isSubmitting}
                        >
                          Save Changes
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="task-details">
                      <div className="detail-section">
                        <h4 className="detail-label">Description</h4>
                        <p className="detail-value">
                          {task.description || "No description provided"}
                        </p>
                      </div>

                      <div className="detail-section">
                        <h4 className="detail-label">Assignee</h4>
                        <p className="detail-value">
                          {task.assigneeName || "Unassigned"}
                        </p>
                      </div>

                      <div className="detail-section">
                        <h4 className="detail-label">Requires approval</h4>
                        <label
                          className="flex items-center justify-between gap-4 rounded-md px-4 py-3"
                          style={{
                            background: "var(--bg-elevated)",
                            border: "1px solid var(--border-subtle)",
                          }}
                        >
                          <div className="space-y-1">
                            <div
                              className="text-sm font-medium"
                              style={{ color: "var(--text-primary)" }}
                            >
                              Operator review required
                            </div>
                            <div
                              className="text-xs"
                              style={{ color: "var(--text-dim)" }}
                            >
                              Agent completion moves this task to Review.
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={requiresApproval}
                            disabled={isUpdatingRequiresApproval}
                            onChange={(e) => {
                              void handleRequiresApprovalChange(e.target.checked);
                            }}
                            className="w-4 h-4"
                            style={{ accentColor: "var(--accent-primary)" }}
                          />
                        </label>
                      </div>

                      {/* Output Section */}
                      {task.output && (
                        <div className="detail-section">
                          <h4 className="detail-label">Output</h4>
                          <div className="output-container">
                            <pre className="output-content">{task.output}</pre>
                          </div>
                        </div>
                      )}

                      {/* Usage Section */}
                      {(task.tokensUsed !== undefined || task.costUsd !== undefined) && (
                        <div className="detail-section">
                          <h4 className="detail-label">Usage</h4>
                          <div className="usage-stats">
                            {task.tokensUsed !== undefined && (
                              <div className="usage-stat">
                                <MappedIcon name="lightning" size="sm" className="usage-icon" />
                                <div className="usage-info">
                                  <span className="usage-label">Tokens Used</span>
                                  <span className="usage-value">
                                    <KineticNumber
                                      value={task.tokensUsed >= 1_000_000
                                        ? task.tokensUsed / 1_000_000
                                        : task.tokensUsed >= 1_000
                                          ? task.tokensUsed / 1_000
                                          : task.tokensUsed
                                      }
                                      decimals={task.tokensUsed >= 1_000_000 ? 2 : task.tokensUsed >= 1_000 ? 1 : 0}
                                      suffix={task.tokensUsed >= 1_000_000 ? "M" : task.tokensUsed >= 1_000 ? "K" : ""}
                                      formatThousands={false}
                                    />
                                  </span>
                                </div>
                              </div>
                            )}
                            {task.costUsd !== undefined && (
                              <div className="usage-stat">
                                <MappedIcon name="cost" size="sm" className="usage-icon" />
                                <div className="usage-info">
                                  <span className="usage-label">Cost</span>
                                  <span className="usage-value cost">
                                    $<KineticNumber value={task.costUsd} decimals={4} formatThousands={true} />
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Session Section */}
                      <div className="detail-section">
                        <h4 className="detail-label">Session</h4>
                        <div className="session-info">
                          {task.sessionKey ? (
                            <code className="session-key">{task.sessionKey}</code>
                          ) : (
                            <p className="detail-value" style={{ color: "var(--text-muted)" }}>
                              No session attached yet
                            </p>
                          )}
                          <div className="session-actions">
                            {task.sessionKey ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  mappedIcon="copy"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(
                                        task.sessionKey ?? ""
                                      );
                                      toast.success("Session key copied");
                                    } catch {
                                      toast.error("Failed to copy session key");
                                    }
                                  }}
                                >
                                  Copy sessionKey
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  icon="ExternalLink"
                                  onClick={() => {
                                    if (!task.sessionKey) return;
                                    const targetSessionId =
                                      parseSessionId(task.sessionKey) ?? task.sessionKey;
                                    router.push(
                                      `/?tab=operations&session=${encodeURIComponent(
                                        targetSessionId
                                      )}`
                                    );
                                    onClose();
                                  }}
                                >
                                  View sessions
                                </Button>
                              </>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="sm"
                              mappedIcon="refresh"
                              loading={isRedispatching}
                              disabled={!primaryAssigneeId}
                              onClick={handleRedispatchClick}
                            >
                              {task.sessionKey ? "Retry session" : "Start session"}
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="detail-section">
                        <h4 className="detail-label">Task ID</h4>
                        <p className="detail-value mono">{task.id}</p>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="comments" className="tab-panel">
                  <div className="comments-section">
                    <CommentThread taskId={taskId} />
                    <div className="comment-input">
                      <Textarea
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="Add a comment... (use @agent to mention)"
                        rows={3}
                      />
                      <Button
                        variant="primary"
                        onClick={handleCommentSubmit}
                        loading={isSubmitting}
                        disabled={!commentText.trim()}
                      >
                        Add Comment
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="activity" className="tab-panel">
                  <ActivityTimeline taskId={taskId} />
                </TabsContent>

                <TabsContent value="terminal" className="tab-panel" forceMount>
                  <div className="terminal-container">
                    {sessionId ? (
                      <LiveTerminal
                        sessionId={sessionId}
                        agentName={task.assigneeName ?? undefined}
                        agentFilter={sessionAgentId}
                      />
                    ) : (
                      <div className="terminal-empty-state">
                        No session attached yet. Start this task to stream live output.
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="transcript" className="tab-panel">
                  <TaskSessionTranscript sessionKey={task.sessionKey} />
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}

        <style jsx>{`
          .task-detail-modal {
            max-width: 900px;
            max-height: 90vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
          }

          .task-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            margin-bottom: 24px;
          }

          .task-title {
            flex: 1;
            margin: 0;
          }

          .task-badges {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-shrink: 0;
          }

          .task-content {
            flex: 1;
            overflow: hidden;
            display: flex;
            flex-direction: column;
          }

          .task-tabs {
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
          }

          .tab-panel {
            flex: 1;
            overflow-y: auto;
            padding: 24px 0;
          }

          .edit-form {
            display: flex;
            flex-direction: column;
            gap: 20px;
          }

          .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
          }

          .edit-actions {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            padding-top: 16px;
            border-top: 1px solid var(--border-subtle);
          }

          .task-details {
            display: flex;
            flex-direction: column;
            gap: 24px;
          }

          .detail-section {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .detail-label {
            font-size: 12px;
            font-weight: 600;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.08em;
            margin: 0;
          }

          .detail-value {
            font-size: 14px;
            color: var(--text-primary);
            margin: 0;
            line-height: 1.6;
            white-space: pre-wrap;
          }

          .detail-value.mono {
            font-family: var(--font-mono);
            font-size: 13px;
            color: var(--text-secondary);
          }

          .output-container {
            background: var(--bg-base);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            padding: 16px;
            max-height: 300px;
            overflow-y: auto;
          }

          .output-content {
            font-family: var(--font-mono);
            font-size: 13px;
            line-height: 1.6;
            color: var(--text-primary);
            margin: 0;
            white-space: pre-wrap;
            word-break: break-word;
          }

          .usage-stats {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .usage-stat {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            background: var(--bg-elevated);
            border-radius: var(--radius-md);
            border: 1px solid var(--border-subtle);
          }

          .usage-icon {
            color: var(--text-muted);
            flex-shrink: 0;
          }

          .usage-info {
            display: flex;
            flex-direction: column;
            gap: 4px;
            flex: 1;
          }

          .usage-label {
            font-size: 11px;
            font-weight: 600;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }

          .usage-value {
            font-family: var(--font-mono);
            font-size: 18px;
            font-weight: 700;
            color: var(--text-primary);
            tabular-nums: tabular-nums;
          }

          .usage-value.cost {
            color: var(--accent-primary);
          }

          .session-info {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
            padding: 12px;
            background: var(--bg-elevated);
            border-radius: var(--radius-md);
            border: 1px solid var(--border-subtle);
          }

          .session-key {
            font-family: var(--font-mono);
            font-size: 12px;
            color: var(--text-secondary);
            background: var(--bg-base);
            padding: 6px 10px;
            border-radius: var(--radius-sm);
            width: 100%;
          }

          .session-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            justify-content: flex-end;
          }

          .comments-section {
            display: flex;
            flex-direction: column;
            gap: 24px;
          }

          .comment-input {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 16px;
            background: var(--bg-elevated);
            border-radius: var(--radius-lg);
            border: 1px solid var(--border-subtle);
          }

          .terminal-container {
            width: 100%;
            height: 500px;
          }

          .terminal-empty-state {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            padding: 20px;
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            background: var(--bg-floating);
            color: var(--text-muted);
            text-align: center;
            font-size: 13px;
          }

          .loading-state {
            padding: 32px;
          }

          .error-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            padding: 64px 32px;
            color: var(--text-muted);
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
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={cancelConfirmOpen}
        onOpenChange={(nextOpen) => {
          if (isSubmitting) return;
          setCancelConfirmOpen(nextOpen);
        }}
        title="Cancel this task?"
        description={
          task ? (
            <>
              Mark <strong>{task.title}</strong> as cancelled? This will remove it from active queues.
            </>
          ) : (
            "Mark this task as cancelled? This will remove it from active queues."
          )
        }
        confirmLabel="Cancel task"
        confirmVariant="danger"
        onConfirm={() => {
          setCancelConfirmOpen(false);
          void handleSave();
        }}
      />

      <ConfirmDialog
        open={redispatchConfirmOpen}
        onOpenChange={(nextOpen) => {
          if (isRedispatching) return;
          setRedispatchConfirmOpen(nextOpen);
        }}
        title="Start a new session?"
        description={
          task ? (
            <>
              This will start a fresh session for <strong>{task.title}</strong> and overwrite the saved{" "}
              <code>sessionKey</code> on the task.
            </>
          ) : (
            <>
              This will start a fresh session and overwrite the saved <code>sessionKey</code> on the task.
            </>
          )
        }
        confirmLabel="Start new session"
        confirmVariant="danger"
        confirmLoading={isRedispatching}
        onConfirm={() => {
          setRedispatchConfirmOpen(false);
          void spawnFreshSession(task?.sessionKey);
        }}
      />
    </>
  );
});
