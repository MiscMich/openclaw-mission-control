import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const taskStatus = v.union(
  v.literal("open"),
  v.literal("inbox"),
  v.literal("assigned"),
  v.literal("in_progress"),
  v.literal("review"),
  v.literal("completed"),
  v.literal("done"),
  v.literal("blocked"),
  v.literal("failed"),
  v.literal("cancelled")
);

const priority = v.union(
  v.literal("low"),
  v.literal("normal"),
  v.literal("high"),
  v.literal("urgent")
);

const agentMessageAttachment = v.object({
  name: v.string(),
  path: v.string(),
  mimeType: v.optional(v.string()),
  size: v.optional(v.number()),
});

const workflowRunStatus = v.union(
  v.literal("running"),
  v.literal("paused"),
  v.literal("blocked"),
  v.literal("failed"),
  v.literal("completed"),
  v.literal("cancelled")
);

const workflowStepStatus = v.union(
  v.literal("waiting"),
  v.literal("pending"),
  v.literal("running"),
  v.literal("needs_human"),
  v.literal("blocked"),
  v.literal("failed"),
  v.literal("done")
);

const workflowStepType = v.union(v.literal("single"), v.literal("loop"));

const workflowStoryStatus = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("done"),
  v.literal("failed")
);

export default defineSchema({
  agents: defineTable({
    id: v.string(),
    name: v.string(),
    role: v.string(),
    emoji: v.string(),
    model: v.string(),
    status: v.union(
      v.literal("idle"),
      v.literal("working"),
      v.literal("offline"),
      v.literal("error")
    ),
    currentTaskId: v.optional(v.string()),
    lastSeen: v.number(),
    totalCost: v.number(),
    totalTokens: v.optional(v.number()),
    todayCost: v.optional(v.number()),
    todayTokens: v.optional(v.number()),
    usageSyncedAt: v.optional(v.number()),
  })
    .index("by_agentId", ["id"])
    .index("by_status", ["status"]),

  agentSettings: defineTable({
    agentId: v.string(),
    name: v.string(),
    emoji: v.string(),
    role: v.string(),
    sessionKey: v.optional(v.string()),
    model: v.object({
      primary: v.string(),
      fallbacks: v.array(v.string()),
    }),
    skills: v.array(v.string()),
    systemPrompts: v.object({
      soul: v.string(),
      agents: v.string(),
      heartbeat: v.string(),
    }),
    toolPolicy: v.optional(v.string()),
    heartbeatCron: v.optional(v.string()),
    configPath: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_agentId", ["agentId"]),

  tasks: defineTable({
    id: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    sessionKey: v.optional(v.string()),
    status: taskStatus,
    requiresApproval: v.optional(v.boolean()),
    priority,
    assigneeId: v.optional(v.string()),
    assigneeIds: v.optional(v.array(v.string())),
    suggestedAssignee: v.optional(v.string()), // Agent suggestion for who should work on this
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    tokensUsed: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    output: v.optional(v.string()),
  })
    .index("by_taskId", ["id"])
    .index("by_status", ["status"])
    // Needed for efficient standup generation and "latest activity" views.
    .index("by_updatedAt", ["updatedAt"])
    .index("by_status_updatedAt", ["status", "updatedAt"])
    .index("by_assignee", ["assigneeId"])
    .index("by_createdAt", ["createdAt"]),

  comments: defineTable({
    id: v.string(),
    taskId: v.string(),
    authorId: v.string(),
    authorName: v.string(),
    content: v.string(),
    mentions: v.optional(v.array(v.string())),
    attachments: v.optional(v.array(v.string())),
    createdAt: v.number(),
  })
    .index("by_commentId", ["id"])
    .index("by_task", ["taskId"])
    .index("by_createdAt", ["createdAt"]),

  documents: defineTable({
    id: v.string(),
    title: v.string(),
    content: v.string(),
    type: v.string(),
    taskId: v.optional(v.string()),
    // Optional linking to workspace / OpenClaw file paths.
    sourcePath: v.optional(v.string()),
    sourceKind: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_documentId", ["id"])
    .index("by_task", ["taskId"])
    .index("by_createdAt", ["createdAt"]),

  notifications: defineTable({
    id: v.string(),
    agentId: v.string(),
    taskId: v.optional(v.string()),
    commentId: v.optional(v.string()),
    content: v.string(),
    delivered: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_notificationId", ["id"])
    .index("by_agent", ["agentId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_delivered", ["delivered"]),

  taskSubscriptions: defineTable({
    taskId: v.string(),
    agentId: v.string(),
    createdAt: v.number(),
  })
    .index("by_task", ["taskId"])
    .index("by_agent", ["agentId"]),

  standups: defineTable({
    id: v.string(),
    date: v.string(),
    summary: v.string(),
    createdAt: v.number(),
  }).index("by_date", ["date"]),

  activity: defineTable({
    id: v.string(),
    type: v.string(),
    message: v.string(),
    agentId: v.optional(v.string()),
    taskId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_activityId", ["id"])
    .index("by_agent", ["agentId"])
    .index("by_task", ["taskId"])
    .index("by_createdAt", ["createdAt"]),

  agentMessages: defineTable({
    id: v.string(),
    fromAgentId: v.string(),
    toAgentId: v.optional(v.string()), // null = broadcast
    content: v.string(),
    mentions: v.optional(v.array(v.string())),
    attachments: v.optional(v.array(agentMessageAttachment)),
    taskId: v.optional(v.string()),
    // Optional OpenClaw sessionKey for messages tied to an external conversation (e.g. Telegram).
    // This enables session-scoped thread views without calling the gateway for history.
    sessionKey: v.optional(v.string()),
    channel: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_messageId", ["id"])
    .index("by_from", ["fromAgentId"])
    .index("by_to", ["toAgentId"])
    .index("by_task", ["taskId"])
    .index("by_sessionKey", ["sessionKey"])
    .index("by_createdAt", ["createdAt"]),

  settings: defineTable({
    key: v.string(),
    value: v.any(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  terminalLogs: defineTable({
    id: v.string(),
    taskId: v.string(),
    data: v.string(),
    timestamp: v.number(),
  })
    .index("by_logId", ["id"])
    .index("by_task", ["taskId"])
    .index("by_timestamp", ["timestamp"]),

  workflowRoleMappings: defineTable({
    workflowId: v.string(),
    // Slot ids are workflow-local agent ids (e.g. "planner", "developer", "triager").
    slotId: v.string(),
    agentId: v.string(),
    // Optional workflow-local model override for this slot mapping.
    modelPrimary: v.optional(v.string()),
    modelFallbacks: v.optional(v.array(v.string())),
    updatedAt: v.number(),
  })
    .index("by_workflow_slot", ["workflowId", "slotId"])
    .index("by_workflow", ["workflowId"])
    .index("by_agent", ["agentId"]),

  workflowSettings: defineTable({
    workflowId: v.string(),
    cronEveryMs: v.number(),
    updatedAt: v.number(),
  }).index("by_workflow", ["workflowId"]),

  workflowRuns: defineTable({
    id: v.string(),
    workflowId: v.string(),
    workflowVersion: v.optional(v.string()),
    title: v.optional(v.string()),
    input: v.string(),
    status: workflowRunStatus,
    context: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
  })
    .index("by_runId", ["id"])
    .index("by_workflow", ["workflowId"])
    .index("by_status", ["status"])
    .index("by_updatedAt", ["updatedAt"])
    .index("by_workflow_status", ["workflowId", "status"]),

  workflowSteps: defineTable({
    id: v.string(),
    runId: v.string(),
    workflowId: v.string(),
    stepId: v.string(),
    stepIndex: v.number(),
    slotId: v.string(),
    agentId: v.string(),
    inputTemplate: v.string(),
    expects: v.string(),
    status: workflowStepStatus,
    type: workflowStepType,
    loopConfig: v.optional(v.any()),
    needsHuman: v.optional(v.boolean()),
    retryStepId: v.optional(v.string()),
    currentStoryId: v.optional(v.string()),
    output: v.optional(v.string()),
    retryCount: v.number(),
    maxRetries: v.number(),
    // Attempt semantics:
    // - attempt increments on each successful claim (new "turn" of execution).
    // - attemptId is a per-claim token required for complete/fail/extendLease to prevent stale updates.
    attempt: v.optional(v.number()),
    attemptId: v.optional(v.string()),
    lastAttemptId: v.optional(v.string()),
    leaseOwner: v.optional(v.string()),
    leaseUntil: v.optional(v.number()),
    leaseUpdatedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_stepId", ["id"])
    .index("by_run", ["runId"])
    .index("by_agent_pending", ["agentId", "status"])
    .index("by_workflow", ["workflowId"])
    .index("by_workflow_status", ["workflowId", "status"])
    .index("by_run_stepIndex", ["runId", "stepIndex"])
    .index("by_run_stepId", ["runId", "stepId"])
    .index("by_workflow_slot", ["workflowId", "slotId"]),

  workflowStories: defineTable({
    id: v.string(),
    runId: v.string(),
    storyIndex: v.number(),
    storyId: v.string(),
    title: v.string(),
    description: v.string(),
    acceptanceCriteria: v.array(v.string()),
    status: workflowStoryStatus,
    output: v.optional(v.string()),
    retryCount: v.number(),
    maxRetries: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_run_status", ["runId", "status"])
    .index("by_storyId", ["storyId"]),

  workflowEvents: defineTable({
    id: v.string(),
    runId: v.string(),
    workflowId: v.string(),
    type: v.string(),
    message: v.string(),
    agentId: v.optional(v.string()),
    stepId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_workflow", ["workflowId"])
    .index("by_createdAt", ["createdAt"]),

  // Tool policy enforcement (Antfarm-style) with durable snapshots.
  openclawAgentToolSnapshots: defineTable({
    agentId: v.string(),
    // Snapshot of the agent's "tools" object from ~/.openclaw/openclaw.json. May be null/undefined.
    tools: v.any(),
    // Snapshot of the agent's workspace path (string) from ~/.openclaw/openclaw.json.
    workspace: v.optional(v.string()),
    takenAt: v.number(),
    updatedAt: v.number(),
  }).index("by_agentId", ["agentId"]),

  workflowRunAgentBindings: defineTable({
    runId: v.string(),
    workflowId: v.string(),
    agentId: v.string(),
    role: v.string(),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_agent", ["agentId"])
    .index("by_workflow", ["workflowId"]),
});
