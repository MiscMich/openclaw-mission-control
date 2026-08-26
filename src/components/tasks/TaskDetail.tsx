"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { StatusDot } from "@/components/ui/StatusDot";
import { TimeAgo } from "@/components/ui/TimeAgo";
import {
  Button,
  ConfirmDialog,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui";
import { CommentThread } from "@/components/tasks/CommentThread";
import { CommentForm } from "@/components/tasks/CommentForm";
import { ActivityTimeline } from "@/components/tasks/ActivityTimeline";
import { DocumentsPanel } from "@/components/dashboard/DocumentsPanel";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convexApi";
import { toast } from "sonner";
import { TaskSessionTranscript } from "@/components/tasks/TaskSessionTranscript";

const LiveTerminal = dynamic(
  () => import("@/components/dashboard/LiveTerminal").then((m) => m.LiveTerminal),
  { ssr: false }
);

type Task = {
  id: string;
  title: string;
  description?: string;
  status: string;
  requiresApproval?: boolean;
  priority: string;
  assigneeId?: string;
  assigneeIds?: string[];
  assignees?: Array<{ id: string; name: string; emoji: string }>;
  createdAt: number;
  tokensUsed?: number;
  costUsd?: number;
  output?: string;
  sessionKey?: string;
};

type Agent = {
  id: string;
  name: string;
  emoji: string;
};

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

export function TaskDetail({ taskId }: { taskId: string }) {
  const router = useRouter();
  const task = useQuery(api.tasks.getById, { id: taskId }) as Task | undefined;
  const agents = (useQuery(api.agents.list, {}) ?? []) as Agent[];
  const updateTask = useMutation(api.tasks.update);
  const updateStatus = useMutation(api.tasks.updateStatus);
  const assignTask = useMutation(api.tasks.assign);
  const completeTask = useMutation(api.tasks.complete);
  const logActivity = useMutation(api.activity.log);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isRedispatching, setIsRedispatching] = useState(false);
  const [redispatchConfirmOpen, setRedispatchConfirmOpen] = useState(false);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [isUpdatingRequiresApproval, setIsUpdatingRequiresApproval] =
    useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRequestingChanges, setIsRequestingChanges] = useState(false);

  useEffect(() => {
    if (!task) return;
    setRequiresApproval(task.requiresApproval ?? false);
  }, [task?.requiresApproval, task?.id]);

  const assigneeIds = task?.assigneeIds ?? [];
  const currentAssignees =
    assigneeIds.length > 0
      ? agents.filter((agent) => assigneeIds.includes(agent.id))
      : [];
  const sessionId = parseSessionId(task?.sessionKey);
  const sessionAgentId = parseSessionAgentId(task?.sessionKey);
  const primaryAssigneeId = assigneeIds[0] ?? task?.assigneeId;

  const handleAssign = async () => {
    if (selectedAssignees.length === 0) return;
    try {
      await assignTask({ id: taskId, assigneeIds: selectedAssignees });
      setSelectedAssignees([]);
      toast.success("Agents assigned", {
        description: `${selectedAssignees.length} agent(s) assigned to task`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error("Failed to assign agents", { description: errorMessage });
    }
  };

  const handleStart = async () => {
    if (!task || isStarting) return;

    const primaryAssigneeId = assigneeIds[0];
    if (!primaryAssigneeId) {
      toast.error("Assign an agent before starting this task");
      return;
    }

    setIsStarting(true);
    try {
      if (task.sessionKey) {
        await updateTask({ id: taskId, status: "in_progress" });
        await logActivity({
          type: "task_started",
          message: `Task started: ${task.title}`,
          agentId: "operator",
          taskId,
        });
      } else {
        const spawnResponse = await fetch("/api/agents/spawn", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            agentId: primaryAssigneeId,
            taskId,
            prompt: `Start task: ${task.title}${
              task.description ? `\n\nDetails:\n${task.description}` : ""
            }`,
          }),
        });
        const payload = (await spawnResponse.json().catch(() => null)) as
          | { success?: boolean; error?: string }
          | null;
        if (!spawnResponse.ok || !payload?.success) {
          throw new Error(payload?.error || "Failed to start session");
        }
      }

      toast.success("Task started", {
        description: `"${task.title}" is now in progress`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error("Failed to start task", { description: errorMessage });
    } finally {
      setIsStarting(false);
    }
  };

  const spawnFreshSession = async (previousSessionKey?: string) => {
    if (!task || isRedispatching) return;

    if (!primaryAssigneeId) {
      toast.error("Assign an agent before starting a session");
      return;
    }

    setIsRedispatching(true);
    try {
      const prompt = `Start task: ${task.title}${
        task.description ? `\n\nDetails:\n${task.description}` : ""
      }${previousSessionKey ? `\n\nNote: retrying previous session ${previousSessionKey}` : ""}`;

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
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error("Failed to start a new session", { description: errorMessage });
    } finally {
      setIsRedispatching(false);
    }
  };

  const handleRedispatchClick = () => {
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
  };

  const handleComplete = async () => {
    try {
      await completeTask({ id: taskId });
      toast.success("Task completed", {
        description: task?.title ? `"${task.title}" marked as done` : "Task marked as done",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error("Failed to complete task", { description: errorMessage });
    }
  };

  const handleRequiresApprovalChange = async (nextValue: boolean) => {
    if (!task || isUpdatingRequiresApproval) return;
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
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error("Failed to update approval requirement", {
        description: errorMessage,
      });
    } finally {
      setIsUpdatingRequiresApproval(false);
    }
  };

  const handleApprove = async () => {
    if (!task || isApproving || isRequestingChanges) return;
    setIsApproving(true);
    try {
      await updateStatus({ id: taskId, status: "done" });
      toast.success("Task approved", {
        description: task.title ? `"${task.title}" marked as done` : "Task marked as done",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error("Failed to approve task", { description: errorMessage });
    } finally {
      setIsApproving(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!task || isApproving || isRequestingChanges) return;
    setIsRequestingChanges(true);
    try {
      await updateStatus({ id: taskId, status: "in_progress" });
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
  };

  const isInProgress = task?.status === "in_progress";

  return (
    <div className="space-y-6">
      <div className="section-card">
        <div className="p-6">
          {!task ? (
            <div className="space-y-3">
              <div className="skeleton h-6 w-2/3 rounded" />
              <div className="skeleton h-4 w-full rounded" />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                      {task.title}
                    </h1>
                    <StatusDot status={isInProgress ? "working" : task.status} showLabel />
                  </div>
                  {task.description && (
                    <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      {task.description}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <PriorityBadge priority={task.priority} />
                  <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                    Created <TimeAgo timestamp={task.createdAt} />
                  </span>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl p-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--hairline)" }}>
                  <div className="text-xs uppercase font-semibold tracking-wider" style={{ color: "var(--text-dim)" }}>
                    Status
                  </div>
                  <div className="mt-2 text-sm font-medium capitalize" style={{ color: isInProgress ? "var(--state-running)" : "var(--text-primary)" }}>
                    {task.status.replace("_", " ")}
                  </div>
                </div>
                <div className="rounded-xl p-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--hairline)" }}>
                  <div className="text-xs uppercase font-semibold tracking-wider" style={{ color: "var(--text-dim)" }}>
                    Assignees
                  </div>
                  <div className="mt-2 text-sm" style={{ color: "var(--text-primary)" }}>
                    {currentAssignees.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {currentAssignees.map((agent) => (
                          <span key={agent.id} className="task-status">
                            {agent.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>Unassigned</span>
                    )}
                  </div>
                </div>
                <div className="rounded-xl p-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--hairline)" }}>
                  <div className="text-xs uppercase font-semibold tracking-wider" style={{ color: "var(--text-dim)" }}>
                    Priority
                  </div>
                  <div className="mt-2 text-sm font-medium capitalize" style={{ color: "var(--text-primary)" }}>
                    {task.priority}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[1.4fr,0.6fr]">
                <div className="rounded-xl p-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--hairline)" }}>
                  <div className="text-xs uppercase font-semibold tracking-wider mb-3" style={{ color: "var(--text-dim)" }}>
                    Assign Agents
                  </div>
                  <div className="grid gap-2">
                    {agents.map((agent) => {
                      const checked = selectedAssignees.includes(agent.id);
                      return (
                        <label key={agent.id} className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedAssignees((prev) =>
                                checked ? prev.filter((id) => id !== agent.id) : [...prev, agent.id]
                              );
                            }}
                          />
                          {agent.name}
                        </label>
                      );
                    })}
                  </div>
                  <Button
                    onClick={handleAssign}
                    disabled={selectedAssignees.length === 0}
                    variant="default"
                    size="sm"
                    className="mt-3"
                  >
                    Assign
                  </Button>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="rounded-xl p-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--hairline)" }}>
                    <div className="text-xs uppercase font-semibold tracking-wider mb-3" style={{ color: "var(--text-dim)" }}>
                      Actions
                    </div>
                    <label
                      className="flex items-start justify-between gap-4 rounded-lg p-3 mb-3"
                      style={{
                        background: "var(--bg-floating)",
                        border: "1px solid var(--hairline)",
                      }}
                    >
                      <div className="space-y-1">
                        <div
                          className="text-sm font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          Requires approval
                        </div>
                        <div
                          className="text-xs"
                          style={{ color: "var(--text-dim)" }}
                        >
                          When enabled, agent completion is queued in Review.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={requiresApproval}
                        disabled={isUpdatingRequiresApproval}
                        onChange={(e) => {
                          void handleRequiresApprovalChange(e.target.checked);
                        }}
                        className="h-4 w-4 rounded border-[var(--border-default)] mt-1"
                        style={{ accentColor: "var(--accent-primary)" }}
                      />
                    </label>
                    <div className="flex flex-col gap-2">
                      {task.status === "review" ? (
                        <>
                          <Button
                            disabled={isApproving || isRequestingChanges}
                            onClick={() => {
                              void handleApprove();
                            }}
                            variant="success"
                            size="sm"
                            className="w-full"
                          >
                            {isApproving ? "Approving..." : "Approve"}
                          </Button>
                          <Button
                            disabled={isApproving || isRequestingChanges}
                            onClick={() => {
                              void handleRequestChanges();
                            }}
                            variant="secondary"
                            size="sm"
                            className="w-full"
                          >
                            {isRequestingChanges
                              ? "Requesting..."
                              : "Request changes"}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            disabled={
                              isStarting ||
                              task.status === "in_progress" ||
                              task.status === "done" ||
                              assigneeIds.length === 0
                            }
                            onClick={handleStart}
                            variant="secondary"
                            size="sm"
                            className="w-full"
                          >
                            {isStarting ? "Starting..." : "Start Task"}
                          </Button>
                          <Button
                            disabled={task.status !== "in_progress"}
                            onClick={handleComplete}
                            variant="success"
                            size="sm"
                            className="w-full"
                          >
                            Complete
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl p-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--hairline)" }}>
                    <div className="text-xs uppercase font-semibold tracking-wider mb-3" style={{ color: "var(--text-dim)" }}>
                      Usage
                    </div>
                    <div className="space-y-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                      <div className="flex items-center justify-between">
                        <span>Tokens</span>
                        <span style={{ color: "var(--text-primary)" }}>
                          {typeof task.tokensUsed === "number"
                            ? task.tokensUsed.toLocaleString()
                            : "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Cost</span>
                        <span style={{ color: "var(--state-success)" }}>
                          {typeof task.costUsd === "number"
                            ? `$${task.costUsd.toFixed(2)}`
                            : "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl p-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--hairline)" }}>
                    <div className="text-xs uppercase font-semibold tracking-wider mb-3" style={{ color: "var(--text-dim)" }}>
                      Session
                    </div>
                    {task.sessionKey ? (
                      <div className="space-y-3">
                        <code className="text-xs break-all" style={{ color: "var(--text-primary)" }}>
                          {task.sessionKey}
                        </code>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            mappedIcon="copy"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(task.sessionKey ?? "");
                                toast.success("Session key copied");
                              } catch {
                                toast.error("Failed to copy session key");
                              }
                            }}
                          >
                            Copy sessionKey
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              const targetSessionId =
                                parseSessionId(task.sessionKey) ?? task.sessionKey ?? "";
                              router.push(
                                `/?tab=operations&session=${encodeURIComponent(targetSessionId)}`
                              );
                            }}
                          >
                            View sessions
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            mappedIcon="refresh"
                            loading={isRedispatching}
                            onClick={handleRedispatchClick}
                          >
                            Retry session
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                          No session attached yet
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          mappedIcon="refresh"
                          loading={isRedispatching}
                          onClick={handleRedispatchClick}
                          disabled={!primaryAssigneeId}
                        >
                          Start session
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {task.output && (
                <div className="rounded-xl p-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--hairline)" }}>
                  <div className="text-xs uppercase font-semibold tracking-wider mb-3" style={{ color: "var(--text-dim)" }}>
                    Output
                  </div>
                  <pre className="text-xs whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
                    {task.output}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Tabs defaultValue="terminal" className="space-y-4">
        <TabsList>
          <TabsTrigger value="terminal">Session Stream</TabsTrigger>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="comments">Comments</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="terminal" className="space-y-4">
          <div className="section-card">
            <div className="p-6">
              <div className="text-xs uppercase font-semibold tracking-wider mb-4" style={{ color: "var(--text-dim)" }}>
                Live session
              </div>
              {sessionId ? (
                <LiveTerminal
                  sessionId={sessionId}
                  agentName={currentAssignees[0]?.name}
                  agentFilter={sessionAgentId}
                />
              ) : (
                <div
                  className="rounded-lg p-4 text-sm"
                  style={{
                    color: "var(--text-muted)",
                    background: "var(--bg-floating)",
                    border: "1px solid var(--hairline)",
                  }}
                >
                  No session attached yet. Start the task to see live output.
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="transcript" className="space-y-4">
          <div className="section-card">
            <div className="p-6">
              <TaskSessionTranscript sessionKey={task?.sessionKey} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <ActivityTimeline taskId={taskId} />
        </TabsContent>

        <TabsContent value="comments" className="space-y-4">
          <CommentThread taskId={taskId} />
          <CommentForm taskId={taskId} />
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <DocumentsPanel taskId={taskId} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={redispatchConfirmOpen}
        onOpenChange={(open) => {
          if (isRedispatching) return;
          setRedispatchConfirmOpen(open);
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
    </div>
  );
}
