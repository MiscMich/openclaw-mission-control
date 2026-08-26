import { authenticatedMutation as mutation, authenticatedQuery as query } from "./auth";
import { v } from "convex/values";
import { normalizeKvOutput, parseStoriesJson, resolveTemplate, validateExpects } from "./workflowOutput";
import {
  assertActiveLease,
  evaluateRetry,
  readyStatusForStep,
  shouldRequeueExpiredLease,
} from "../src/lib/workflows/invariants";

const RUN_STATUSES_ACTIVE = new Set(["running"] as const);

function nowMs() {
  return Date.now();
}

async function logWorkflowEvent(ctx: any, params: {
  workflowId: string;
  runId: string;
  type: string;
  message: string;
  agentId?: string;
  stepId?: string;
}) {
  await ctx.db.insert("workflowEvents", {
    id: crypto.randomUUID(),
    workflowId: params.workflowId,
    runId: params.runId,
    type: params.type,
    message: params.message,
    agentId: params.agentId,
    stepId: params.stepId,
    createdAt: nowMs(),
  });
}

export const listRoleMappings = query({
  args: { workflowId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("workflowRoleMappings")
      .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId))
      .collect();
    return rows.map((r: any) => ({
      slotId: r.slotId,
      agentId: r.agentId,
      modelPrimary: r.modelPrimary,
      modelFallbacks: r.modelFallbacks ?? [],
      updatedAt: r.updatedAt,
    }));
  },
});

export const upsertRoleMappings = mutation({
  args: {
    workflowId: v.string(),
    mappings: v.array(
      v.object({
        slotId: v.string(),
        agentId: v.string(),
        modelPrimary: v.optional(v.string()),
        modelFallbacks: v.optional(v.array(v.string())),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Role mapping changes can break deterministic cron turns for in-flight runs.
    // Keep this invariant: mapping is immutable while any run is non-terminal.
    const nonTerminalStatuses = ["running", "paused", "blocked"] as const;
    for (const status of nonTerminalStatuses) {
      const active = await ctx.db
        .query("workflowRuns")
        .withIndex("by_workflow_status", (q: any) => q.eq("workflowId", args.workflowId).eq("status", status))
        .first();
      if (active) {
        throw new Error(
          `Cannot change role mapping while run "${active.id}" is ${status}. ` +
            "Cancel/complete the run first (or create a new workflow id for different mappings)."
        );
      }
    }

    const uniqueAgents = new Set(args.mappings.map((m) => m.agentId));
    if (uniqueAgents.size !== args.mappings.length) {
      throw new Error("Role mapping requires unique agentId per slot (duplicates are not allowed).");
    }

    const ts = nowMs();
    for (const mapping of args.mappings) {
      const existing = await ctx.db
        .query("workflowRoleMappings")
        .withIndex("by_workflow_slot", (q) =>
          q.eq("workflowId", args.workflowId).eq("slotId", mapping.slotId)
        )
        .first();
      const modelPrimary =
        mapping.modelPrimary === undefined ? undefined : String(mapping.modelPrimary || "").trim() || undefined;
      const modelFallbacks =
        mapping.modelFallbacks === undefined
          ? undefined
          : Array.from(
              new Set(
                (mapping.modelFallbacks ?? [])
                  .map((m) => String(m || "").trim())
                  .filter((m) => !!m && m !== modelPrimary)
              )
            );
      if (existing) {
        await ctx.db.patch(existing._id, {
          agentId: mapping.agentId,
          ...(mapping.modelPrimary !== undefined ? { modelPrimary } : {}),
          ...(mapping.modelFallbacks !== undefined ? { modelFallbacks } : {}),
          updatedAt: ts,
        });
      } else {
        await ctx.db.insert("workflowRoleMappings", {
          workflowId: args.workflowId,
          slotId: mapping.slotId,
          agentId: mapping.agentId,
          ...(modelPrimary ? { modelPrimary } : {}),
          ...(modelFallbacks ? { modelFallbacks } : {}),
          updatedAt: ts,
        });
      }
    }
    return { ok: true };
  },
});

export const setWorkflowSlotSettings = mutation({
  args: {
    workflowId: v.string(),
    slotId: v.string(),
    agentId: v.optional(v.string()),
    modelPrimary: v.optional(v.string()),
    modelFallbacks: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const ts = nowMs();
    const row = await ctx.db
      .query("workflowRoleMappings")
      .withIndex("by_workflow_slot", (q: any) => q.eq("workflowId", args.workflowId).eq("slotId", args.slotId))
      .first();
    if (!row) {
      throw new Error(`Workflow slot mapping not found for slot "${args.slotId}"`);
    }

    const modelPrimary =
      args.modelPrimary === undefined ? undefined : String(args.modelPrimary || "").trim() || undefined;
    const modelFallbacks =
      args.modelFallbacks === undefined
        ? undefined
        : Array.from(
            new Set(
              (args.modelFallbacks ?? [])
                .map((m) => String(m || "").trim())
                .filter((m) => !!m && m !== modelPrimary)
            )
          );

    const nextAgentId =
      args.agentId === undefined ? row.agentId : String(args.agentId || "").trim() || row.agentId;

    await ctx.db.patch(row._id, {
      agentId: nextAgentId,
      ...(args.modelPrimary !== undefined ? { modelPrimary } : {}),
      ...(args.modelFallbacks !== undefined ? { modelFallbacks } : {}),
      updatedAt: ts,
    });

    return {
      ok: true,
      workflowId: args.workflowId,
      slotId: args.slotId,
      agentId: nextAgentId,
      ...(args.modelPrimary !== undefined ? { modelPrimary } : {}),
      ...(args.modelFallbacks !== undefined ? { modelFallbacks } : {}),
    };
  },
});

export const getWorkflowSettings = query({
  args: { workflowId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("workflowSettings")
      .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId))
      .first();
    return row ? { workflowId: row.workflowId, cronEveryMs: row.cronEveryMs, updatedAt: row.updatedAt } : null;
  },
});

export const setWorkflowSettings = mutation({
  args: { workflowId: v.string(), cronEveryMs: v.number() },
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.cronEveryMs) || args.cronEveryMs < 10_000) {
      throw new Error("cronEveryMs must be >= 10000");
    }
    const ts = nowMs();
    const existing = await ctx.db
      .query("workflowSettings")
      .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { cronEveryMs: args.cronEveryMs, updatedAt: ts });
    } else {
      await ctx.db.insert("workflowSettings", { workflowId: args.workflowId, cronEveryMs: args.cronEveryMs, updatedAt: ts });
    }
    return { ok: true };
  },
});

export const createRun = mutation({
  args: {
    workflowId: v.string(),
    workflowVersion: v.optional(v.string()),
    title: v.optional(v.string()),
    input: v.string(),
    steps: v.array(
      v.object({
        stepId: v.string(),
        stepIndex: v.number(),
        slotId: v.string(),
        agentId: v.string(),
        inputTemplate: v.string(),
        expects: v.string(),
        type: v.union(v.literal("single"), v.literal("loop")),
        loopConfig: v.optional(v.any()),
        needsHuman: v.optional(v.boolean()),
        retryStepId: v.optional(v.string()),
        maxRetries: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const ts = nowMs();
    const runId = crypto.randomUUID();
    await ctx.db.insert("workflowRuns", {
      id: runId,
      workflowId: args.workflowId,
      workflowVersion: args.workflowVersion,
      title: args.title,
      input: args.input,
      status: "running",
      context: { task: args.input },
      createdAt: ts,
      updatedAt: ts,
      startedAt: ts,
    });

    for (const step of args.steps) {
      const needsHuman = step.needsHuman === true;
      await ctx.db.insert("workflowSteps", {
        id: crypto.randomUUID(),
        runId,
        workflowId: args.workflowId,
        stepId: step.stepId,
        stepIndex: step.stepIndex,
        slotId: step.slotId,
        agentId: step.agentId,
        inputTemplate: step.inputTemplate,
        expects: step.expects,
        status: step.stepIndex === 0 ? readyStatusForStep(needsHuman) : "waiting",
        type: step.type,
        loopConfig: step.loopConfig,
        needsHuman,
        retryStepId: step.retryStepId,
        retryCount: 0,
        maxRetries: step.maxRetries,
        attempt: 0,
        attemptId: undefined,
        lastAttemptId: undefined,
        createdAt: ts,
        updatedAt: ts,
      });
    }

    await logWorkflowEvent(ctx, {
      workflowId: args.workflowId,
      runId,
      type: "run_created",
      message: `Run created: ${args.title ?? args.input}`,
    });

    return { ok: true, runId };
  },
});

export const listRuns = query({
  args: {
    workflowId: v.optional(v.string()),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(500, args.limit ?? 100));
    const includeArchived = args.includeArchived === true;
    const takeCount = includeArchived ? limit : Math.min(1000, Math.max(limit * 5, limit));
    const q = args.workflowId
      ? ctx.db.query("workflowRuns").withIndex("by_workflow", (qq) => qq.eq("workflowId", args.workflowId!))
      : ctx.db.query("workflowRuns");
    const rows = await q.order("desc").take(takeCount);
    let filtered = args.status ? rows.filter((r: any) => r.status === args.status) : rows;
    if (!includeArchived) {
      filtered = filtered.filter((r: any) => !r.archivedAt);
    }
    return filtered.slice(0, limit);
  },
});

export const listBoardRuns = query({
  args: {
    workflowId: v.string(),
    limit: v.optional(v.number()),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(300, args.limit ?? 120));
    const includeArchived = args.includeArchived === true;
    const takeCount = includeArchived ? limit : Math.min(1200, Math.max(limit * 5, limit));

    const rows = await ctx.db
      .query("workflowRuns")
      .withIndex("by_workflow", (q: any) => q.eq("workflowId", args.workflowId))
      .order("desc")
      .take(takeCount);

    const runs = (includeArchived ? rows : rows.filter((r: any) => !r.archivedAt))
      .filter((r: any) => typeof r?.id === "string" && r.id.length > 0)
      .slice(0, limit);
    if (runs.length === 0) return [];

    const runIds = new Set(runs.map((r: any) => r.id));

    const steps = await ctx.db
      .query("workflowSteps")
      .withIndex("by_workflow", (q: any) => q.eq("workflowId", args.workflowId))
      .collect();

    const stepsByRun = new Map<string, any[]>();
    for (const step of steps) {
      if (!runIds.has(step.runId)) continue;
      const list = stepsByRun.get(step.runId) ?? [];
      list.push(step);
      stepsByRun.set(step.runId, list);
    }
    for (const list of stepsByRun.values()) {
      list.sort((a: any, b: any) => (a.stepIndex ?? 0) - (b.stepIndex ?? 0));
    }

    const eventLimit = Math.min(2000, Math.max(400, runs.length * 20));
    const events = await ctx.db
      .query("workflowEvents")
      .withIndex("by_workflow", (q: any) => q.eq("workflowId", args.workflowId))
      .order("desc")
      .take(eventLimit);

    const latestEventByRun = new Map<string, any>();
    for (const ev of events) {
      if (!runIds.has(ev.runId)) continue;
      if (!latestEventByRun.has(ev.runId)) latestEventByRun.set(ev.runId, ev);
    }

    const activeStatuses = new Set(["running", "needs_human", "pending", "blocked", "failed"]);

    return runs.map((run: any) => {
      const runSteps = stepsByRun.get(run.id) ?? [];
      const activeStep = runSteps.find((s: any) => activeStatuses.has(s.status)) ?? null;
      const stepCounts = runSteps.reduce((acc: Record<string, number>, s: any) => {
        acc[s.status] = (acc[s.status] ?? 0) + 1;
        return acc;
      }, {});
      const latestEvent = latestEventByRun.get(run.id) ?? null;
      return {
        run,
        activeStep,
        latestEvent,
        stepCounts,
      };
    });
  },
});

export const listNeedsHumanSteps = query({
  args: { workflowId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(200, args.limit ?? 50));
    const steps = await ctx.db
      .query("workflowSteps")
      .withIndex("by_workflow_status", (q: any) => q.eq("workflowId", args.workflowId).eq("status", "needs_human"))
      .collect();

    const rows: Array<any> = [];
    for (const step of steps) {
      const run = await ctx.db
        .query("workflowRuns")
        .withIndex("by_runId", (q: any) => q.eq("id", step.runId))
        .first();
      if (!run) continue;
      if (!RUN_STATUSES_ACTIVE.has(run.status as any)) continue;
      rows.push({
        runId: run.id,
        runTitle: run.title ?? run.input ?? run.id,
        runStatus: run.status,
        step,
      });
    }

    rows.sort((a, b) => (b.step.updatedAt ?? 0) - (a.step.updatedAt ?? 0));
    return rows.slice(0, limit);
  },
});

export const countActiveRunsForWorkflow = query({
  args: { workflowId: v.string() },
  handler: async (ctx, args) => {
    const running = await ctx.db
      .query("workflowRuns")
      .withIndex("by_workflow_status", (q: any) =>
        q.eq("workflowId", args.workflowId).eq("status", "running")
      )
      .collect();
    return { workflowId: args.workflowId, active: running.length };
  },
});

export const setRunStatus = mutation({
  args: { runId: v.string(), status: v.string(), message: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const ts = nowMs();
    const run = await ctx.db
      .query("workflowRuns")
      .withIndex("by_runId", (q: any) => q.eq("id", args.runId))
      .first();
    if (!run) throw new Error(`Run not found: ${args.runId}`);
    await ctx.db.patch(run._id, {
      status: args.status as any,
      updatedAt: ts,
      ...(args.status === "completed" || args.status === "failed" || args.status === "cancelled"
        ? { finishedAt: ts }
        : {}),
      ...(args.status === "running" ? { finishedAt: undefined } : {}),
    });
    if (args.message) {
      await logWorkflowEvent(ctx, {
        workflowId: run.workflowId,
        runId: run.id,
        type: "run_status",
        message: args.message,
      });
    }
    return { ok: true };
  },
});

export const archiveRun = mutation({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    const ts = nowMs();
    const run = await ctx.db
      .query("workflowRuns")
      .withIndex("by_runId", (q: any) => q.eq("id", args.runId))
      .first();
    if (!run) throw new Error(`Run not found: ${args.runId}`);
    if (run.status !== "completed" && run.status !== "cancelled") {
      throw new Error(`Only completed or cancelled runs can be archived (status=${run.status})`);
    }
    if (run.archivedAt) {
      return { ok: true, runId: run.id, archivedAt: run.archivedAt };
    }

    await ctx.db.patch(run._id, {
      archivedAt: ts,
      updatedAt: ts,
    });

    await logWorkflowEvent(ctx, {
      workflowId: run.workflowId,
      runId: run.id,
      type: "run_archived",
      message: "Run archived",
    });

    return { ok: true, runId: run.id, archivedAt: ts };
  },
});

export const retryRunFromStep = mutation({
  args: {
    runId: v.string(),
    retryStepId: v.string(),
    feedback: v.optional(v.string()),
    reason: v.optional(v.string()),
    agentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ts = nowMs();
    const run = await ctx.db
      .query("workflowRuns")
      .withIndex("by_runId", (q: any) => q.eq("id", args.runId))
      .first();
    if (!run) throw new Error(`Run not found: ${args.runId}`);
    if (run.status === "cancelled" || run.status === "completed") {
      throw new Error(`Cannot retry run in status "${run.status}"`);
    }

    const retryStepId = String(args.retryStepId ?? "").trim();
    if (!retryStepId) throw new Error("retryStepId is required");

    const feedback = String(args.feedback ?? "").trim();
    const reason = String(args.reason ?? "").trim() || "operator_retry";

    const reset = await resetPipelineFromStepId(ctx, {
      runId: run.id,
      retryStepId,
      ts,
      feedback,
      reason,
    });

    // Resume the run.
    await ctx.db.patch(run._id, {
      status: "running",
      finishedAt: undefined,
      updatedAt: ts,
    });

    await logWorkflowEvent(ctx, {
      workflowId: run.workflowId,
      runId: run.id,
      type: "run_resumed",
      message: `Run retried from step "${retryStepId}"`,
      agentId: args.agentId,
    });

    // Spread first so we don't duplicate/overwrite keys in a way TS rejects in strict builds.
    return { ...reset, workflowId: run.workflowId, runId: run.id, retryStepId, ok: true };
  },
});

// Apply the workflow role mapping to this run's *non-completed* steps.
// This lets operators change role mappings between runs and then retry a failed run safely.
export const applyRoleMappingToRun = mutation({
  args: {
    runId: v.string(),
    mappings: v.array(v.object({ slotId: v.string(), agentId: v.string() })),
    agentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ts = nowMs();
    const run = await ctx.db
      .query("workflowRuns")
      .withIndex("by_runId", (q: any) => q.eq("id", args.runId))
      .first();
    if (!run) throw new Error(`Run not found: ${args.runId}`);

    const steps = await ctx.db
      .query("workflowSteps")
      .withIndex("by_run", (q: any) => q.eq("runId", run.id))
      .collect();

    const map = new Map(args.mappings.map((m) => [m.slotId, m.agentId]));
    let changed = 0;

    for (const step of steps) {
      if (step.status === "done") continue;
      const mapped = map.get(step.slotId);
      if (!mapped) continue;
      if (step.agentId === mapped) continue;
      if (step.status === "running") {
        throw new Error(`Cannot apply mapping: step "${step.stepId}" is currently running`);
      }
      await ctx.db.patch(step._id, { agentId: mapped, updatedAt: ts });
      changed++;
    }

    await logWorkflowEvent(ctx, {
      workflowId: run.workflowId,
      runId: run.id,
      type: "run_agents_mapped",
      message: `Applied role mapping to run steps (changed=${changed})`,
      agentId: args.agentId,
    });

    return { ok: true, workflowId: run.workflowId, runId: run.id, changed };
  },
});

export const forceReleaseLease = mutation({
  args: { stepId: v.string(), agentId: v.optional(v.string()), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const ts = nowMs();
    const step = await ctx.db
      .query("workflowSteps")
      .withIndex("by_stepId", (q: any) => q.eq("id", args.stepId))
      .first();
    if (!step) throw new Error(`Step not found: ${args.stepId}`);

    const run = await ctx.db
      .query("workflowRuns")
      .withIndex("by_runId", (q: any) => q.eq("id", step.runId))
      .first();
    if (!run) throw new Error(`Run not found: ${step.runId}`);

    if (step.status !== "running") {
      return { ok: true, workflowId: step.workflowId, runId: step.runId, stepId: step.id, released: false, status: step.status };
    }

    const nextStatus = readyStatusForStep(step.needsHuman === true);
    await ctx.db.patch(step._id, {
      status: nextStatus,
      attemptId: undefined,
      leaseOwner: undefined,
      leaseUntil: undefined,
      leaseUpdatedAt: ts,
      updatedAt: ts,
    });

    await logWorkflowEvent(ctx, {
      workflowId: step.workflowId,
      runId: step.runId,
      type: "lease_force_released",
      message: `Lease force-released for step ${step.stepId} (${args.reason ?? "operator"})`,
      agentId: args.agentId,
      stepId: step.id,
    });

    return { ok: true, workflowId: step.workflowId, runId: step.runId, stepId: step.id, released: true, status: nextStatus };
  },
});

export const reassignStep = mutation({
  args: { stepId: v.string(), newAgentId: v.string(), agentId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const ts = nowMs();
    const step = await ctx.db
      .query("workflowSteps")
      .withIndex("by_stepId", (q: any) => q.eq("id", args.stepId))
      .first();
    if (!step) throw new Error(`Step not found: ${args.stepId}`);

    const newAgentId = String(args.newAgentId ?? "").trim();
    if (!newAgentId) throw new Error("newAgentId is required");
    if (newAgentId === step.agentId) return { ok: true, workflowId: step.workflowId, runId: step.runId, stepId: step.id, changed: false };

    if (step.status === "running") {
      throw new Error("Cannot reassign a running step. Force-release the lease first.");
    }
    if (step.status === "done") {
      throw new Error("Cannot reassign a completed step.");
    }

    // Reassign applies to the whole slot within this run for any steps that haven't completed yet.
    const steps = await ctx.db
      .query("workflowSteps")
      .withIndex("by_run", (q: any) => q.eq("runId", step.runId))
      .collect();
    const sameSlot = steps.filter((s: any) => s.slotId === step.slotId && s.status !== "done");
    const running = sameSlot.find((s: any) => s.status === "running");
    if (running) throw new Error("Cannot reassign while a step in this slot is running. Force-release the lease first.");

    for (const s of sameSlot) {
      if (s.agentId === newAgentId) continue;
      await ctx.db.patch(s._id, { agentId: newAgentId, updatedAt: ts });
    }

    await logWorkflowEvent(ctx, {
      workflowId: step.workflowId,
      runId: step.runId,
      type: "step_reassigned",
      message: `Step ${step.stepId} reassigned to ${newAgentId}`,
      agentId: args.agentId,
      stepId: step.id,
    });

    return { ok: true, workflowId: step.workflowId, runId: step.runId, stepId: step.id, changed: true, agentId: newAgentId };
  },
});

export const getRun = query({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("workflowRuns")
      .withIndex("by_runId", (q: any) => q.eq("id", args.runId))
      .first();
    if (!run) return null;
    const steps = await ctx.db
      .query("workflowSteps")
      .withIndex("by_run", (q: any) => q.eq("runId", args.runId))
      .collect();
    const stories = await ctx.db
      .query("workflowStories")
      .withIndex("by_run", (q: any) => q.eq("runId", args.runId))
      .collect();
    const events = await ctx.db
      .query("workflowEvents")
      .withIndex("by_run", (q: any) => q.eq("runId", args.runId))
      .order("desc")
      .take(200);
    return { run, steps: steps.sort((a: any, b: any) => a.stepIndex - b.stepIndex), stories, events };
  },
});

export const getStepMeta = query({
  args: { stepId: v.string() },
  handler: async (ctx, args) => {
    const step = await ctx.db
      .query("workflowSteps")
      .withIndex("by_stepId", (q: any) => q.eq("id", args.stepId))
      .first();
    if (!step) return null;
    return {
      stepId: step.id,
      runId: step.runId,
      workflowId: step.workflowId,
      slotId: step.slotId,
      agentId: step.agentId,
      status: step.status,
      stepKey: step.stepId,
      stepIndex: step.stepIndex,
    };
  },
});

export const claimStep = mutation({
  args: {
    workflowId: v.string(),
    slotId: v.string(),
    agentId: v.string(),
    extraContext: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const ts = nowMs();

    // Reap expired leases for this agent/workflow/slot (best-effort).
    const runningSteps = await ctx.db
      .query("workflowSteps")
      .withIndex("by_workflow_slot", (q: any) => q.eq("workflowId", args.workflowId).eq("slotId", args.slotId))
      .collect();
    for (const st of runningSteps) {
      if (shouldRequeueExpiredLease(st, ts)) {
        await ctx.db.patch(st._id, {
          status: readyStatusForStep(st.needsHuman === true),
          attemptId: undefined,
          leaseOwner: undefined,
          leaseUntil: undefined,
          leaseUpdatedAt: ts,
          updatedAt: ts,
        });
        await logWorkflowEvent(ctx, {
          workflowId: st.workflowId,
          runId: st.runId,
          type: "lease_expired",
          message: `Lease expired for step ${st.stepId}; re-queued.`,
          agentId: args.agentId,
          stepId: st.id,
        });
      }
    }

    const candidates = await ctx.db
      .query("workflowSteps")
      .withIndex("by_workflow_slot", (q: any) => q.eq("workflowId", args.workflowId).eq("slotId", args.slotId))
      .filter((q: any) => q.eq(q.field("agentId"), args.agentId))
      .filter((q: any) => q.eq(q.field("status"), "pending"))
      .collect();
    const step = candidates.sort((a: any, b: any) => a.stepIndex - b.stepIndex)[0];

    if (!step) return { found: false as const };

    // Load run context.
    const run = await ctx.db
      .query("workflowRuns")
      .withIndex("by_runId", (q: any) => q.eq("id", step.runId))
      .first();
    if (!run) {
      await ctx.db.patch(step._id, { status: "failed", output: "Run record missing", updatedAt: ts });
      return { found: false as const };
    }

    if (!RUN_STATUSES_ACTIVE.has(run.status as any)) {
      return { found: false as const };
    }

    const leaseMs = 15 * 60 * 1000;
    const leaseUntil = ts + leaseMs;
    const attemptId = crypto.randomUUID();
    const attempt = (step.attempt ?? 0) + 1;

    // Loop step story claim logic.
    let resolvedContext: Record<string, any> = { ...(run.context ?? {}) };
    if (step.type === "loop") {
      const pendingStories = await ctx.db
        .query("workflowStories")
        .withIndex("by_run_status", (q: any) => q.eq("runId", step.runId).eq("status", "pending"))
        .collect();
      const nextStory = pendingStories.sort((a: any, b: any) => a.storyIndex - b.storyIndex)[0];
      if (!nextStory) {
        // No more stories: mark done and advance.
        await ctx.db.patch(step._id, { status: "done", updatedAt: ts, attemptId: undefined, leaseOwner: undefined, leaseUntil: undefined });
        await logWorkflowEvent(ctx, {
          workflowId: step.workflowId,
          runId: step.runId,
          type: "step_done",
          message: `Loop step ${step.stepId} completed (no stories remaining).`,
          agentId: args.agentId,
          stepId: step.id,
        });
        await advancePipeline(ctx, step.runId, ts);
        return { found: false as const };
      }

      await ctx.db.patch(nextStory._id, { status: "running", updatedAt: ts });
      await ctx.db.patch(step._id, {
        status: "running",
        currentStoryId: nextStory.id,
        attempt,
        attemptId,
        leaseOwner: args.agentId,
        leaseUntil,
        leaseUpdatedAt: ts,
        updatedAt: ts,
      });

      resolvedContext = {
        ...resolvedContext,
        current_story: formatStoryForTemplate(nextStory),
        current_story_id: nextStory.storyId,
        current_story_title: nextStory.title,
        completed_stories: await formatCompletedStories(ctx, step.runId),
        stories_remaining: String(await countRemainingStories(ctx, step.runId)),
        verify_feedback: resolvedContext.verify_feedback ?? "",
      };
    } else {
      await ctx.db.patch(step._id, {
        status: "running",
        attempt,
        attemptId,
        leaseOwner: args.agentId,
        leaseUntil,
        leaseUpdatedAt: ts,
        updatedAt: ts,
      });
    }

    // Allow Next.js to inject additional context at claim time (e.g. progress.txt),
    // without having Convex depend on local filesystem access.
    const extra = (args.extraContext && typeof args.extraContext === "object") ? args.extraContext : null;
    const fullContext = extra ? { ...resolvedContext, ...extra } : resolvedContext;
    const resolvedInput = resolveTemplate(step.inputTemplate, fullContext);

    await logWorkflowEvent(ctx, {
      workflowId: step.workflowId,
      runId: step.runId,
      type: "step_claimed",
      message: `Claimed step ${step.stepId} (slot ${step.slotId})`,
      agentId: args.agentId,
      stepId: step.id,
    });

    return {
      found: true as const,
      runId: step.runId,
      stepId: step.id,
      stepKey: step.stepId,
      input: resolvedInput,
      expects: step.expects,
      leaseUntil,
      attempt,
      attemptId,
      retryCount: step.retryCount,
      type: step.type,
    };
  },
});

export const claimHumanStep = mutation({
  args: { stepId: v.string(), agentId: v.string(), extraContext: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const ts = nowMs();
    const step = await ctx.db
      .query("workflowSteps")
      .withIndex("by_stepId", (q: any) => q.eq("id", args.stepId))
      .first();
    if (!step) throw new Error(`Step not found: ${args.stepId}`);
    if (step.status !== "needs_human") return { found: false as const };
    if (step.agentId !== args.agentId) throw new Error("Human step is assigned to a different agent");

    const run = await ctx.db
      .query("workflowRuns")
      .withIndex("by_runId", (q: any) => q.eq("id", step.runId))
      .first();
    if (!run) throw new Error(`Run not found: ${step.runId}`);
    if (!RUN_STATUSES_ACTIVE.has(run.status as any)) return { found: false as const };

    const attemptId = crypto.randomUUID();
    const attempt = (step.attempt ?? 0) + 1;
    const leaseMs = 15 * 60 * 1000;
    const leaseUntil = ts + leaseMs;

    await ctx.db.patch(step._id, {
      status: "running",
      attempt,
      attemptId,
      leaseOwner: args.agentId,
      leaseUntil,
      leaseUpdatedAt: ts,
      updatedAt: ts,
    });

    const baseContext = { ...(run.context ?? {}) };
    const extra = (args.extraContext && typeof args.extraContext === "object") ? args.extraContext : null;
    const resolvedInput = resolveTemplate(step.inputTemplate, extra ? { ...baseContext, ...extra } : baseContext);

    await logWorkflowEvent(ctx, {
      workflowId: step.workflowId,
      runId: step.runId,
      type: "human_claimed",
      message: `Human step claimed: ${step.stepId}`,
      agentId: args.agentId,
      stepId: step.id,
    });

    return {
      found: true as const,
      workflowId: step.workflowId,
      runId: step.runId,
      stepId: step.id,
      stepKey: step.stepId,
      input: resolvedInput,
      expects: step.expects,
      leaseUntil,
      attempt,
      attemptId,
    };
  },
});

export const resolveHumanStep = mutation({
  args: {
    stepId: v.string(),
    agentId: v.string(),
    attemptId: v.string(),
    decision: v.union(v.literal("approve"), v.literal("reject")),
    feedback: v.optional(v.string()),
    retryStepId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ts = nowMs();
    const step = await ctx.db
      .query("workflowSteps")
      .withIndex("by_stepId", (q: any) => q.eq("id", args.stepId))
      .first();
    if (!step) throw new Error(`Step not found: ${args.stepId}`);
    assertActiveLease(step, { agentId: args.agentId, attemptId: args.attemptId, now: ts });

    const run = await ctx.db
      .query("workflowRuns")
      .withIndex("by_runId", (q: any) => q.eq("id", step.runId))
      .first();
    if (!run) throw new Error(`Run not found: ${step.runId}`);

    const feedback = (args.feedback ?? "").trim();

    if (args.decision === "approve") {
      const output = [
        "STATUS: done",
        "DECISION: approved",
        ...(feedback ? [`FEEDBACK: ${feedback}`] : []),
        "",
      ].join("\n");

      const kv = normalizeKvOutput(output);
      const expectsCheck = validateExpects(step.expects, output, kv);
      if (!expectsCheck.ok) throw new Error(`Cannot approve: expects failed. ${expectsCheck.error}`);

      await ctx.db.patch(run._id, { context: { ...(run.context ?? {}), ...kv }, updatedAt: ts });
      await ctx.db.patch(step._id, {
        status: "done",
        output,
        lastAttemptId: args.attemptId,
        attemptId: undefined,
        leaseOwner: undefined,
        leaseUntil: undefined,
        completedAt: ts,
        updatedAt: ts,
      });
      await logWorkflowEvent(ctx, {
        workflowId: step.workflowId,
        runId: step.runId,
        type: "human_approved",
        message: `Approved human step ${step.stepId}`,
        agentId: args.agentId,
        stepId: step.id,
      });
      const adv = await advancePipeline(ctx, step.runId, ts);
      return { ok: true, workflowId: step.workflowId, runId: step.runId, decision: "approved", ...adv };
    }

    // reject: reset pipeline to retryStepId (request override) or step.retryStepId (workflow-defined) or previous step.
    let retryFrom = (args.retryStepId ?? "").trim() || (step.retryStepId ?? "").trim();
    if (!retryFrom) {
      // Default to previous step if it exists.
      const steps = await ctx.db
        .query("workflowSteps")
        .withIndex("by_run", (q: any) => q.eq("runId", step.runId))
        .collect();
      const prev = steps
        .filter((s: any) => (s.stepIndex ?? 0) < step.stepIndex)
        .sort((a: any, b: any) => b.stepIndex - a.stepIndex)[0];
      if (prev) retryFrom = prev.stepId;
    }

    // Clear this step's lease token before resetting.
    await ctx.db.patch(step._id, {
      output: feedback ? `STATUS: retry\nDECISION: changes_requested\nFEEDBACK: ${feedback}\n` : "STATUS: retry\nDECISION: changes_requested\n",
      lastAttemptId: args.attemptId,
      attemptId: undefined,
      leaseOwner: undefined,
      leaseUntil: undefined,
      updatedAt: ts,
    });

    if (!retryFrom) {
      await ctx.db.patch(run._id, {
        status: "blocked",
        context: { ...(run.context ?? {}), status: "blocked", review_feedback: feedback },
        updatedAt: ts,
      });
      await logWorkflowEvent(ctx, {
        workflowId: step.workflowId,
        runId: step.runId,
        type: "human_rejected",
        message: "Rejected (no retryFrom available): run blocked",
        agentId: args.agentId,
        stepId: step.id,
      });
      return { ok: true, workflowId: step.workflowId, runId: step.runId, decision: "rejected", blocked: true };
    }

    await resetPipelineFromStepId(ctx, {
      runId: step.runId,
      retryStepId: retryFrom,
      ts,
      feedback,
      reason: "human_reject",
    });
    await logWorkflowEvent(ctx, {
      workflowId: step.workflowId,
      runId: step.runId,
      type: "human_rejected",
      message: `Rejected human step ${step.stepId}; reset from ${retryFrom}`,
      agentId: args.agentId,
      stepId: step.id,
    });
    return { ok: true, workflowId: step.workflowId, runId: step.runId, decision: "rejected", resetFrom: retryFrom };
  },
});

function formatStoryForTemplate(story: any): string {
  const ac = (story.acceptanceCriteria ?? []).map((c: string, i: number) => `  ${i + 1}. ${c}`).join("\n");
  return `Story ${story.storyId}: ${story.title}\n\n${story.description}\n\nAcceptance Criteria:\n${ac}`;
}

async function formatCompletedStories(ctx: any, runId: string): Promise<string> {
  const done = await ctx.db
    .query("workflowStories")
    .withIndex("by_run_status", (q: any) => q.eq("runId", runId).eq("status", "done"))
    .collect();
  if (done.length === 0) return "(none yet)";
  return done
    .sort((a: any, b: any) => a.storyIndex - b.storyIndex)
    .map((s: any) => `- ${s.storyId}: ${s.title}`)
    .join("\n");
}

async function countRemainingStories(ctx: any, runId: string): Promise<number> {
  const rows = await ctx.db
    .query("workflowStories")
    .withIndex("by_run", (q: any) => q.eq("runId", runId))
    .collect();
  return rows.filter((s: any) => s.status === "pending" || s.status === "running").length;
}

async function advancePipeline(ctx: any, runId: string, ts: number): Promise<{ advanced: boolean; runCompleted: boolean }> {
  const waiting = await ctx.db
    .query("workflowSteps")
    .withIndex("by_run", (q: any) => q.eq("runId", runId))
    .filter((q: any) => q.eq(q.field("status"), "waiting"))
    .collect();
  const next = waiting.sort((a: any, b: any) => a.stepIndex - b.stepIndex)[0];

  if (next) {
    const status = readyStatusForStep(next.needsHuman === true);
    await ctx.db.patch(next._id, { status, updatedAt: ts });
    await logWorkflowEvent(ctx, {
      workflowId: next.workflowId,
      runId,
      type: next.needsHuman ? "needs_human" : "step_ready",
      message: next.needsHuman
        ? `Human approval required for step ${next.stepId}`
        : `Step ${next.stepId} is now pending`,
      stepId: next.id,
    });
    return { advanced: true, runCompleted: false };
  }

  // No more steps.
  const run = await ctx.db
    .query("workflowRuns")
    .withIndex("by_runId", (q: any) => q.eq("id", runId))
    .first();
  if (run) {
    await ctx.db.patch(run._id, { status: "completed", finishedAt: ts, updatedAt: ts });
    await logWorkflowEvent(ctx, {
      workflowId: run.workflowId,
      runId,
      type: "run_completed",
      message: "Run completed",
    });
  }
  return { advanced: false, runCompleted: true };
}

async function resetPipelineFromStepId(
  ctx: any,
  params: { runId: string; retryStepId: string; ts: number; feedback: string; reason: string }
): Promise<{ ok: true; reset: boolean; error?: string }> {
  const { runId, retryStepId, ts } = params;

  const steps = await ctx.db
    .query("workflowSteps")
    .withIndex("by_run", (q: any) => q.eq("runId", runId))
    .collect();
  const target = steps.find((s: any) => s.stepId === retryStepId);
  if (!target) {
    const run = await ctx.db
      .query("workflowRuns")
      .withIndex("by_runId", (q: any) => q.eq("id", runId))
      .first();
    if (run) await ctx.db.patch(run._id, { status: "blocked", updatedAt: ts });
    await logWorkflowEvent(ctx, {
      workflowId: (run?.workflowId as string) ?? "unknown",
      runId,
      type: "pipeline_reset_failed",
      message: `Cannot reset pipeline: retryStepId "${retryStepId}" not found`,
    });
    return { ok: true, reset: false, error: `retryStepId "${retryStepId}" not found` };
  }

  const targetIndex = target.stepIndex as number;
  const clearAttempt = {
    attemptId: undefined,
    leaseOwner: undefined,
    leaseUntil: undefined,
    leaseUpdatedAt: ts,
    currentStoryId: undefined,
  };

  // Set all steps at/after target back to waiting (except target becomes pending / needs_human).
  for (const s of steps) {
    if ((s.stepIndex as number) < targetIndex) continue;
    await ctx.db.patch(s._id, {
      status: "waiting",
      updatedAt: ts,
      ...clearAttempt,
    });
  }

  // Ensure a loop step has at least one pending story (otherwise the loop step will immediately self-complete).
  if (target.type === "loop") {
    const stories = await ctx.db
      .query("workflowStories")
      .withIndex("by_run", (q: any) => q.eq("runId", runId))
      .collect();
    const hasPending = stories.some((st: any) => st.status === "pending");
    if (!hasPending) {
      const maxIdx = stories.reduce((m: number, st: any) => Math.max(m, st.storyIndex ?? 0), -1);
      const storyId = `changes-${ts}`;
      await ctx.db.insert("workflowStories", {
        id: crypto.randomUUID(),
        runId,
        storyIndex: maxIdx + 1,
        storyId,
        title: "Changes requested",
        description: params.feedback || "Changes requested by reviewer/operator.",
        acceptanceCriteria: [
          "Address the review feedback",
          "Typecheck passes",
          "Tests pass",
        ],
        status: "pending",
        retryCount: 0,
        maxRetries: 2,
        createdAt: ts,
        updatedAt: ts,
      });
      await logWorkflowEvent(ctx, {
        workflowId: target.workflowId,
        runId,
        type: "changes_story_inserted",
        message: `Inserted synthetic story ${storyId} to satisfy loop retry`,
        stepId: target.id,
      });
    }
  }

  const readyStatus = readyStatusForStep(target.needsHuman === true);
  await ctx.db.patch(target._id, { status: readyStatus, updatedAt: ts });

  const run = await ctx.db
    .query("workflowRuns")
    .withIndex("by_runId", (q: any) => q.eq("id", runId))
    .first();
  if (run) {
    const nextContext = {
      ...(run.context ?? {}),
      status: "retry",
      review_feedback: params.feedback,
      verify_feedback: params.feedback,
    };
    await ctx.db.patch(run._id, { context: nextContext, updatedAt: ts });
  }

  await logWorkflowEvent(ctx, {
    workflowId: target.workflowId,
    runId,
    type: "pipeline_reset",
    message: `Pipeline reset from step "${retryStepId}" (${params.reason})`,
    stepId: target.id,
  });
  return { ok: true, reset: true };
}

export const completeStep = mutation({
  args: {
    stepId: v.string(),
    agentId: v.string(),
    attemptId: v.optional(v.string()),
    output: v.string(),
  },
  handler: async (ctx, args) => {
    const ts = nowMs();
    const step = await ctx.db
      .query("workflowSteps")
      .withIndex("by_stepId", (q: any) => q.eq("id", args.stepId))
      .first();
    if (!step) throw new Error(`Step not found: ${args.stepId}`);

    // Idempotency: if already done with this attemptId, no-op.
    if (step.status === "done" && args.attemptId && step.lastAttemptId === args.attemptId) {
      return { ok: true, workflowId: step.workflowId, runId: step.runId, alreadyCompleted: true, advanced: false, runCompleted: false };
    }

    if (!args.attemptId) throw new Error("attemptId is required");
    assertActiveLease(step, { agentId: args.agentId, attemptId: args.attemptId, now: ts });

    const run = await ctx.db
      .query("workflowRuns")
      .withIndex("by_runId", (q: any) => q.eq("id", step.runId))
      .first();
    if (!run) throw new Error(`Run not found: ${step.runId}`);

    // Merge KV output into context.
    const kv = normalizeKvOutput(args.output);
    const expectsCheck = validateExpects(step.expects, args.output, kv);
    if (!expectsCheck.ok) {
      // Treat expects mismatch as a failure (retryable) handled by server-side retry logic.
      const failResult = await applyStepFailure(ctx, {
        step,
        agentId: args.agentId,
        ts,
        error: `expects mismatch: ${expectsCheck.error}`,
      });
      return { ...failResult, workflowId: step.workflowId, runId: step.runId };
    }

    const nextContext = { ...(run.context ?? {}), ...kv };

    // Parse and insert stories if present.
    try {
      const stories = parseStoriesJson(args.output);
      if (stories && stories.length > 0) {
        const seen = new Set<string>();
        for (let i = 0; i < stories.length; i++) {
          const s = stories[i];
          const ac = s.acceptanceCriteria ?? s.acceptance_criteria;
          if (!s.id || !s.title || !s.description || !Array.isArray(ac) || ac.length === 0) {
            throw new Error(
              `STORIES_JSON story at index ${i} missing required fields (id, title, description, acceptanceCriteria)`
            );
          }
          if (seen.has(s.id)) throw new Error(`STORIES_JSON has duplicate story id "${s.id}"`);
          seen.add(s.id);

          await ctx.db.insert("workflowStories", {
            id: crypto.randomUUID(),
            runId: step.runId,
            storyIndex: i,
            storyId: s.id,
            title: s.title,
            description: s.description,
            acceptanceCriteria: ac,
            status: "pending",
            retryCount: 0,
            maxRetries: 2,
            createdAt: ts,
            updatedAt: ts,
          });
        }
        await logWorkflowEvent(ctx, {
          workflowId: step.workflowId,
          runId: step.runId,
          type: "stories_inserted",
          message: `Inserted ${stories.length} stories from STORIES_JSON`,
          agentId: args.agentId,
          stepId: step.id,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failResult = await applyStepFailure(ctx, {
        step,
        agentId: args.agentId,
        ts,
        error: `Invalid STORIES_JSON: ${message}`,
      });
      return { ...failResult, workflowId: step.workflowId, runId: step.runId };
    }

    await ctx.db.patch(run._id, { context: nextContext, updatedAt: ts });

    // Loop step completion.
    if (step.type === "loop" && step.currentStoryId) {
      const runningStories = await ctx.db
        .query("workflowStories")
        .withIndex("by_run", (q: any) => q.eq("runId", step.runId))
        .collect();
      const current = runningStories.find((s: any) => s.id === step.currentStoryId);
      if (current) {
        await ctx.db.patch(current._id, { status: "done", output: args.output, updatedAt: ts });
      }

      await ctx.db.patch(step._id, {
        currentStoryId: undefined,
        output: args.output,
        updatedAt: ts,
      });

      const lc = step.loopConfig as any;
      if (lc?.verify_each && lc?.verify_step) {
        // Set verify step to pending, keep loop step running.
        const verify = await ctx.db
          .query("workflowSteps")
          .withIndex("by_run_stepId", (q: any) => q.eq("runId", step.runId).eq("stepId", lc.verify_step))
          .first();
        if (verify) {
          await ctx.db.patch(verify._id, { status: "pending", updatedAt: ts });
          await ctx.db.patch(step._id, { status: "running", updatedAt: ts });
          await logWorkflowEvent(ctx, {
            workflowId: step.workflowId,
            runId: step.runId,
            type: "verify_pending",
            message: `Verify step ${lc.verify_step} set to pending`,
            agentId: args.agentId,
            stepId: verify.id,
          });
          return { ok: true, workflowId: step.workflowId, runId: step.runId, advanced: false, runCompleted: false };
        }
      }

      const cont = await checkLoopContinuation(ctx, step.runId, step._id, ts);
      return { ...cont, workflowId: step.workflowId, runId: step.runId };
    }

    // Verify-each completion check.
    const loopRunning = await ctx.db
      .query("workflowSteps")
      .withIndex("by_run", (q: any) => q.eq("runId", step.runId))
      .filter((q: any) => q.eq(q.field("type"), "loop"))
      .filter((q: any) => q.eq(q.field("status"), "running"))
      .first();
    if (loopRunning?.loopConfig) {
      const lc = loopRunning.loopConfig as any;
      if (lc?.verify_each && lc?.verify_step === step.stepId) {
        const res = await handleVerifyEachCompletion(ctx, step, loopRunning, args.output, nextContext, ts);
        return { ...res, workflowId: step.workflowId, runId: step.runId };
      }
    }

    // Single step completion.
    await ctx.db.patch(step._id, {
      status: "done",
      output: args.output,
      lastAttemptId: args.attemptId,
      attemptId: undefined,
      leaseOwner: undefined,
      leaseUntil: undefined,
      completedAt: ts,
      updatedAt: ts,
    });
    await logWorkflowEvent(ctx, {
      workflowId: step.workflowId,
      runId: step.runId,
      type: "step_done",
      message: `Step ${step.stepId} done`,
      agentId: args.agentId,
      stepId: step.id,
    });

    const adv = await advancePipeline(ctx, step.runId, ts);
    return { ok: true, workflowId: step.workflowId, runId: step.runId, ...adv };
  },
});

async function handleVerifyEachCompletion(ctx: any, verifyStep: any, loopStep: any, output: string, context: Record<string, any>, ts: number) {
  // Reset verify step to waiting for next use.
  await ctx.db.patch(verifyStep._id, { status: "waiting", output, updatedAt: ts });

  const status = String(context.status ?? "").toLowerCase();
  if (status === "retry") {
    const allStories = await ctx.db
      .query("workflowStories")
      .withIndex("by_run", (q: any) => q.eq("runId", verifyStep.runId))
      .collect();
    const lastDone = allStories
      .filter((s: any) => s.status === "done")
      .sort((a: any, b: any) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];

    if (lastDone) {
      const retry = evaluateRetry(lastDone.retryCount ?? 0, lastDone.maxRetries ?? 2);
      const newRetry = retry.retryCount;
      if (retry.exhausted) {
        await ctx.db.patch(lastDone._id, { status: "failed", retryCount: newRetry, updatedAt: ts });
        await ctx.db.patch(loopStep._id, { status: "failed", updatedAt: ts });
        const run = await ctx.db
          .query("workflowRuns")
          .withIndex("by_runId", (q: any) => q.eq("id", verifyStep.runId))
          .first();
        if (run) await ctx.db.patch(run._id, { status: "failed", updatedAt: ts, finishedAt: ts });
        await logWorkflowEvent(ctx, {
          workflowId: loopStep.workflowId,
          runId: verifyStep.runId,
          type: "run_failed",
          message: "Verify retries exhausted; run failed",
          stepId: loopStep.id,
        });
        return { ok: true, advanced: false, runCompleted: false };
      }

      await ctx.db.patch(lastDone._id, { status: "pending", retryCount: newRetry, updatedAt: ts });
      const issues = context.issues ?? output;
      const run = await ctx.db
        .query("workflowRuns")
        .withIndex("by_runId", (q: any) => q.eq("id", verifyStep.runId))
        .first();
      if (run) {
        await ctx.db.patch(run._id, {
          context: { ...context, verify_feedback: issues },
          updatedAt: ts,
        });
      }
    }

    await ctx.db.patch(loopStep._id, { status: "pending", updatedAt: ts });
    return { ok: true, advanced: false, runCompleted: false };
  }

  // Verify passed: clear feedback and continue.
  const nextContext = { ...context };
  delete nextContext.verify_feedback;
  const run = await ctx.db
    .query("workflowRuns")
    .withIndex("by_runId", (q: any) => q.eq("id", verifyStep.runId))
    .first();
  if (run) await ctx.db.patch(run._id, { context: nextContext, updatedAt: ts });

  return await checkLoopContinuation(ctx, verifyStep.runId, loopStep._id, ts);
}

async function checkLoopContinuation(ctx: any, runId: string, loopStepDocId: any, ts: number) {
  const pending = await ctx.db
    .query("workflowStories")
    .withIndex("by_run_status", (q: any) => q.eq("runId", runId).eq("status", "pending"))
    .first();
  if (pending) {
    await ctx.db.patch(loopStepDocId, { status: "pending", updatedAt: ts });
    return { ok: true, advanced: false, runCompleted: false };
  }

  await ctx.db.patch(loopStepDocId, { status: "done", updatedAt: ts });
  const loopStep = await ctx.db.get(loopStepDocId);
  if (loopStep?.loopConfig?.verify_each && loopStep?.loopConfig?.verify_step) {
    const verify = await ctx.db
      .query("workflowSteps")
      .withIndex("by_run_stepId", (q: any) => q.eq("runId", runId).eq("stepId", loopStep.loopConfig.verify_step))
      .first();
    if (verify) await ctx.db.patch(verify._id, { status: "done", updatedAt: ts });
  }

  const adv = await advancePipeline(ctx, runId, ts);
  return { ok: true, ...adv };
}

async function applyStepFailure(
  ctx: any,
  params: { step: any; agentId: string; ts: number; error: string }
): Promise<{ ok: true; retrying: boolean; runFailed: boolean }> {
  const step = params.step;
  const ts = params.ts;

  // Clear lease / attempt token when failing an attempt.
  const clearAttempt = {
    attemptId: undefined,
    leaseOwner: undefined,
    leaseUntil: undefined,
    leaseUpdatedAt: ts,
  };

  // Loop step: per-story retry if currentStoryId is set.
  if (step.type === "loop" && step.currentStoryId) {
    const stories = await ctx.db
      .query("workflowStories")
      .withIndex("by_run", (q: any) => q.eq("runId", step.runId))
      .collect();
    const current = stories.find((s: any) => s.id === step.currentStoryId);
    if (current) {
      const retry = evaluateRetry(current.retryCount ?? 0, current.maxRetries ?? 2);
      const newRetry = retry.retryCount;
      if (retry.exhausted) {
        await ctx.db.patch(current._id, { status: "failed", retryCount: newRetry, output: params.error, updatedAt: ts });
        await ctx.db.patch(step._id, {
          status: "failed",
          output: params.error,
          currentStoryId: undefined,
          retryCount: (step.retryCount ?? 0) + 1,
          lastAttemptId: step.attemptId,
          failedAt: ts,
          updatedAt: ts,
          ...clearAttempt,
        });
        const run = await ctx.db
          .query("workflowRuns")
          .withIndex("by_runId", (q: any) => q.eq("id", step.runId))
          .first();
        if (run) await ctx.db.patch(run._id, { status: "failed", updatedAt: ts, finishedAt: ts });
        await logWorkflowEvent(ctx, {
          workflowId: step.workflowId,
          runId: step.runId,
          type: "run_failed",
          message: `Story retries exhausted; run failed: ${params.error}`,
          agentId: params.agentId,
          stepId: step.id,
        });
        return { ok: true, retrying: false, runFailed: true };
      }

      await ctx.db.patch(current._id, { status: "pending", retryCount: newRetry, updatedAt: ts });
      await ctx.db.patch(step._id, {
        status: "pending",
        output: params.error,
        currentStoryId: undefined,
        retryCount: (step.retryCount ?? 0) + 1,
        lastAttemptId: step.attemptId,
        updatedAt: ts,
        ...clearAttempt,
      });
      await logWorkflowEvent(ctx, {
        workflowId: step.workflowId,
        runId: step.runId,
        type: "step_retry",
        message: `Loop story retrying (${newRetry}/${current.maxRetries ?? 2})`,
        agentId: params.agentId,
        stepId: step.id,
      });
      return { ok: true, retrying: true, runFailed: false };
    }
  }

  // Single step (or loop step without a story): retry based on step retryCount/maxRetries.
  const retry = evaluateRetry(step.retryCount ?? 0, step.maxRetries ?? 2);
  const newRetry = retry.retryCount;
  if (retry.exhausted) {
    await ctx.db.patch(step._id, {
      status: "failed",
      output: params.error,
      retryCount: newRetry,
      lastAttemptId: step.attemptId,
      failedAt: ts,
      updatedAt: ts,
      ...clearAttempt,
    });
    const run = await ctx.db
      .query("workflowRuns")
      .withIndex("by_runId", (q: any) => q.eq("id", step.runId))
      .first();
    if (run) await ctx.db.patch(run._id, { status: "failed", updatedAt: ts, finishedAt: ts });
    await logWorkflowEvent(ctx, {
      workflowId: step.workflowId,
      runId: step.runId,
      type: "run_failed",
      message: `Step retries exhausted; run failed: ${params.error}`,
      agentId: params.agentId,
      stepId: step.id,
    });
    return { ok: true, retrying: false, runFailed: true };
  }

  // If a retryStepId is provided (Antfarm-style), reset the pipeline from that step.
  if (step.retryStepId && typeof step.retryStepId === "string" && step.retryStepId.trim()) {
    const retryFrom = step.retryStepId.trim();
    await ctx.db.patch(step._id, {
      status: "waiting",
      output: params.error,
      retryCount: newRetry,
      lastAttemptId: step.attemptId,
      updatedAt: ts,
      ...clearAttempt,
    });
    await resetPipelineFromStepId(ctx, {
      runId: step.runId,
      retryStepId: retryFrom,
      ts,
      feedback: params.error,
      reason: "on_fail.retry_step",
    });
    await logWorkflowEvent(ctx, {
      workflowId: step.workflowId,
      runId: step.runId,
      type: "step_retry_step",
      message: `Step ${step.stepId} retrying via retry_step=${retryFrom} (${newRetry}/${step.maxRetries})`,
      agentId: params.agentId,
      stepId: step.id,
    });
    return { ok: true, retrying: true, runFailed: false };
  }

  // Default: retry the same step.
  await ctx.db.patch(step._id, {
    status: readyStatusForStep(step.needsHuman === true),
    output: params.error,
    retryCount: newRetry,
    lastAttemptId: step.attemptId,
    updatedAt: ts,
    ...clearAttempt,
  });
  await logWorkflowEvent(ctx, {
    workflowId: step.workflowId,
    runId: step.runId,
    type: "step_retry",
    message: `Step ${step.stepId} retrying (${newRetry}/${step.maxRetries})`,
    agentId: params.agentId,
    stepId: step.id,
  });
  return { ok: true, retrying: true, runFailed: false };
}

export const failStep = mutation({
  args: { stepId: v.string(), agentId: v.string(), attemptId: v.optional(v.string()), error: v.string() },
  handler: async (ctx, args) => {
    const ts = nowMs();
    const step = await ctx.db
      .query("workflowSteps")
      .withIndex("by_stepId", (q: any) => q.eq("id", args.stepId))
      .first();
    if (!step) throw new Error(`Step not found: ${args.stepId}`);

    // Idempotency: if already failed with this attemptId, no-op.
    if (step.status === "failed" && args.attemptId && step.lastAttemptId === args.attemptId) {
      return { ok: true, workflowId: step.workflowId, runId: step.runId, alreadyFailed: true, retrying: false, runFailed: true };
    }

    if (!args.attemptId) throw new Error("attemptId is required");
    assertActiveLease(step, { agentId: args.agentId, attemptId: args.attemptId, now: ts });

    const res = await applyStepFailure(ctx, { step, agentId: args.agentId, ts, error: args.error });
    return { ...res, workflowId: step.workflowId, runId: step.runId };
  },
});

export const extendLease = mutation({
  args: { stepId: v.string(), agentId: v.string(), attemptId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const ts = nowMs();
    const step = await ctx.db
      .query("workflowSteps")
      .withIndex("by_stepId", (q: any) => q.eq("id", args.stepId))
      .first();
    if (!step) throw new Error(`Step not found: ${args.stepId}`);
    if (!args.attemptId) return { ok: false, error: "attemptId is required" };
    try {
      assertActiveLease(step, { agentId: args.agentId, attemptId: args.attemptId, now: ts });
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Invalid lease" };
    }
    const leaseMs = 15 * 60 * 1000;
    const leaseUntil = ts + leaseMs;
    await ctx.db.patch(step._id, { leaseOwner: args.agentId, leaseUntil, leaseUpdatedAt: ts, updatedAt: ts });
    return { ok: true, leaseUntil };
  },
});
