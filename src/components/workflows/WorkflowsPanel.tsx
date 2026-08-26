"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@/lib/convexApi";
import { cn } from "@/lib/utils";
import {
  WorkflowRunBoard,
  type WorkflowRunBoardColumn,
  type WorkflowRunBoardRun,
} from "@/components/workflows/WorkflowRunBoard";
import {
  AgentAvatar,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FormGroup,
  GlassPanel,
  Input,
  Select,
  Textarea,
  TimeAgo,
} from "@/components/ui";

type WorkflowListItem = {
  id: string;
  name?: string | null;
  version?: string | number | null;
  description?: string | null;
  slots?: Array<{ id: string; role?: string | null; name?: string | null }>;
  error?: string;
};

type AgentListItem = {
  id: string;
  name?: string;
  role?: string;
  model?: string;
  status?: string;
};

type MappingRow = {
  slotId: string;
  agentId: string | null;
  modelPrimary?: string | null;
  modelFallbacks?: string[];
};

type MappingResponse = {
  ok: boolean;
  workflowId: string;
  requiredSlots: string[];
  mappings: MappingRow[];
  error?: string;
};

type WorkflowSettingsResponse = {
  ok: boolean;
  workflowId: string;
  settings: { workflowId: string; cronEveryMs: number; updatedAt: number } | null;
  error?: string;
};

type BoardStep = {
  id: string;
  stepId: string;
  stepIndex: number;
  slotId: string;
  agentId: string;
  status: string;
  leaseOwner?: string;
  leaseUntil?: number;
};

type BoardEvent = {
  id: string;
  type: string;
  message: string;
  createdAt: number;
  agentId?: string;
  stepId?: string;
};

type BoardRunRow = {
  run: {
    id: string;
    title?: string;
    input?: string;
    status: string;
    createdAt?: number;
    updatedAt?: number;
    archivedAt?: number;
  };
  activeStep: BoardStep | null;
  latestEvent: BoardEvent | null;
  stepCounts?: Record<string, number>;
};

function hasBoardRunId(row: BoardRunRow | null | undefined): row is BoardRunRow {
  return !!row?.run && typeof row.run.id === "string" && row.run.id.length > 0;
}

type RunDetailStep = {
  id: string;
  stepId: string;
  stepIndex: number;
  slotId: string;
  agentId: string;
  status: string;
  attemptId?: string;
  leaseOwner?: string;
  leaseUntil?: number;
  retryStepId?: string;
};

type RunDetailEvent = {
  id: string;
  type: string;
  message: string;
  createdAt: number;
  agentId?: string;
  stepId?: string;
};

type ClaimResponse = {
  found: boolean;
  attemptId?: string;
};

type MutationResponse = {
  ok?: boolean;
  error?: string;
};

type MappingDraftValue = {
  agentId: string;
  modelPrimary: string;
  modelFallbacks: string[];
};

type QueuedRunDraft = {
  id: string;
  title: string;
  input: string;
};

const ATTENTION_STATUSES = new Set(["needs_human", "failed", "blocked", "paused"]);
const ALERT_ELIGIBLE_RUN_STATUSES = new Set(["running", "paused", "blocked", "failed", "needs_human"]);
const RUN_ALERT_MAX_PER_CYCLE = 3;
const RUN_STALL_MIN_AGE_MS = 5 * 60 * 1000;
const STALE_LEASE_GRACE_MS = 60 * 1000;
const RUN_ALERT_COOLDOWN_MS = 10 * 60 * 1000;
const runAlertCooldownUntil = new Map<string, number>();

const BASE_SLOT_MODEL_OPTIONS = [
  { value: "", label: "Use assigned person's default model" },
];

type OpenClawModelsResponse = {
  ok: boolean;
  models?: Array<{ id: string; label: string }>;
};

function uniqueModelOptionsFromAgents(rows: AgentListItem[]): Array<{ value: string; label: string }> {
  const seen = new Set<string>();
  const out: Array<{ value: string; label: string }> = [];
  for (const row of rows) {
    const model = typeof row.model === "string" ? row.model.trim() : "";
    if (!model || seen.has(model)) continue;
    seen.add(model);
    out.push({ value: model, label: model });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

function msToHuman(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "unknown";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return `${h}h`;
}

function toTitleCase(input: string): string {
  return input
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function readableWorkflowStatus(status?: string): string {
  const s = (status ?? "").trim().toLowerCase();
  if (!s) return "Unknown";
  if (s === "needs_human") return "Needs attention";
  if (s === "completed") return "Done";
  if (s === "cancelled") return "Stopped";
  return toTitleCase(s);
}

function stepPillClass(status: string | undefined): string {
  const s = status ?? "unknown";
  if (s === "pending") return "wf-step wf-step--pending";
  if (s === "waiting") return "wf-step wf-step--waiting";
  if (s === "running") return "wf-step wf-step--running";
  if (s === "done") return "wf-step wf-step--done";
  if (s === "failed") return "wf-step wf-step--failed";
  return "wf-step wf-step--unknown";
}

function executionLockText(step: BoardStep | null): string {
  if (!step) return "Waiting to start";
  if (!step.leaseUntil) return "Waiting for next update";
  const remaining = step.leaseUntil - Date.now();
  const owner = step.leaseOwner || "assigned person";
  if (remaining <= 0) return `Last update from ${owner} is stale; auto-retry is next`;
  return `Currently with ${owner}; next check in ${msToHuman(remaining)}`;
}

function summaryFallback(runStatus?: string): string {
  const s = (runStatus ?? "").toLowerCase();
  if (s === "running") return "Working through the next stage.";
  if (s === "needs_human") return "Waiting for your decision.";
  if (s === "paused") return "Paused until resumed.";
  if (s === "failed" || s === "blocked") return "Needs intervention before it can continue.";
  if (s === "completed") return "Run finished successfully.";
  if (s === "cancelled") return "Run was stopped.";
  return "Run is in progress.";
}

function parseFallbacksCsv(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
}

function truncateToastReason(input: string, maxChars = 220): string {
  const value = input.trim();
  if (!value) return "The job needs your review.";
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 3)}...`;
}

function humanizeRunIssue(message: string): string {
  const value = message.trim();
  if (!value) return "The job needs your review.";

  const lower = value.toLowerCase();
  if (lower.includes("cron setup failed")) {
    return "Automatic checks could not start. Open Lane setup, save assignments, then try again.";
  }
  if (lower.includes("gateway timeout") || lower.includes("gateway returned")) {
    return "OpenClaw did not respond in time. The job is waiting for the next check.";
  }
  if (lower.includes("rate_limit_error")) {
    return "The model provider hit a rate limit. The job will continue when capacity is available.";
  }
  if (lower.includes("authentication_error") || lower.includes("api key appears to be invalid")) {
    return "Model credentials were rejected. Update the provider credentials and retry.";
  }
  if (lower.includes("chat not found")) {
    return "A message destination is invalid, so delivery updates could not be sent.";
  }
  if (
    lower.includes("pong timeout") ||
    (lower.includes("slack") && lower.includes("timeout")) ||
    (lower.includes("slack") && lower.includes("disconnect"))
  ) {
    return "Slack lost connection briefly. OpenClaw Mission Control will reconnect and keep the run moving.";
  }
  if (lower.includes("telegram") && lower.includes("heartbeat")) {
    return "Telegram heartbeat delivery failed. Job processing can continue, but alerts may be delayed.";
  }
  return value;
}

function normalizeApiErrorMessage(message: string): string {
  const value = message.trim();
  if (!value) return "Request failed";

  const cleaned = value
    .replace(/\[Request ID:[^\]]+\]\s*/gi, "")
    .replace(/^Server Error\s*/i, "")
    .replace(/^Uncaught Error:\s*/i, "")
    .trim();
  const lower = cleaned.toLowerCase();

  if (lower.includes("only completed runs can be archived")) {
    return "Only finished or stopped jobs can be archived.";
  }
  if (lower.includes("gateway timeout")) {
    return "OpenClaw took too long to respond. Try again in a moment.";
  }
  if (lower.includes("cron setup failed")) {
    return "Automatic checks could not start. Open Lane setup, save assignments, then retry.";
  }

  return cleaned;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) {
    const msg = data?.error || `Request failed (${res.status})`;
    throw new Error(normalizeApiErrorMessage(msg));
  }
  return data as T;
}

function isWorkflowListItem(value: unknown): value is WorkflowListItem {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && row.id.trim().length > 0;
}

function isAgentListItem(value: unknown): value is AgentListItem {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && row.id.trim().length > 0;
}

export function WorkflowsPanel() {
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");

  const [mapping, setMapping] = useState<MappingResponse | null>(null);
  const [mappingDraft, setMappingDraft] = useState<Record<string, MappingDraftValue>>({});
  const [savingMapping, setSavingMapping] = useState(false);
  const [installingAgents, setInstallingAgents] = useState(false);

  const [cronEveryMsDraft, setCronEveryMsDraft] = useState<number>(300_000);
  const [savingSettings, setSavingSettings] = useState(false);
  const [cronOpsBusy, setCronOpsBusy] = useState(false);

  const [runTitle, setRunTitle] = useState("");
  const [runInput, setRunInput] = useState("");
  const runInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [creatingRun, setCreatingRun] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [queuedRunDrafts, setQueuedRunDrafts] = useState<QueuedRunDraft[]>([]);
  const [startingQueuedRuns, setStartingQueuedRuns] = useState(false);
  const [laneSetupOpen, setLaneSetupOpen] = useState(false);

  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const [humanDialogOpen, setHumanDialogOpen] = useState(false);
  const [humanTargetStep, setHumanTargetStep] = useState<RunDetailStep | null>(null);
  const [humanFeedback, setHumanFeedback] = useState("");
  const [humanRetryFrom, setHumanRetryFrom] = useState<string>("");
  const [humanBusy, setHumanBusy] = useState(false);

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [runOpsBusy, setRunOpsBusy] = useState(false);

  const [retryDialogOpen, setRetryDialogOpen] = useState(false);
  const [retryFromStep, setRetryFromStep] = useState<string>("");
  const [retryFeedback, setRetryFeedback] = useState<string>("");
  const [retryBusy, setRetryBusy] = useState(false);

  const [leaseBusyStepId, setLeaseBusyStepId] = useState<string | null>(null);
  const [forceReleaseBusyStepId, setForceReleaseBusyStepId] = useState<string | null>(null);

  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [reassignTargetStep, setReassignTargetStep] = useState<RunDetailStep | null>(null);
  const [reassignAgentId, setReassignAgentId] = useState<string>("");
  const [reassignBusy, setReassignBusy] = useState(false);

  const [slotSettingsOpen, setSlotSettingsOpen] = useState(false);
  const [slotSettingsBusy, setSlotSettingsBusy] = useState(false);
  const [slotSettingsSlotId, setSlotSettingsSlotId] = useState<string>("");
  const [slotSettingsAgentId, setSlotSettingsAgentId] = useState<string>("");
  const [slotSettingsModelPrimary, setSlotSettingsModelPrimary] = useState<string>("");
  const [slotSettingsModelFallbacksCsv, setSlotSettingsModelFallbacksCsv] = useState<string>("");
  const [slotModelOptions, setSlotModelOptions] = useState(BASE_SLOT_MODEL_OPTIONS);
  const runAlertFingerprintRef = useRef<Record<string, string>>({});

  const validWorkflows = useMemo(() => workflows.filter(isWorkflowListItem), [workflows]);
  const validAgents = useMemo(() => agents.filter(isAgentListItem), [agents]);

  const runDetail = useQuery(api.workflows.getRun, selectedRunId ? { runId: selectedRunId } : "skip");
  const runSteps = (runDetail?.steps ?? []) as RunDetailStep[];
  const runEvents = (runDetail?.events ?? []) as RunDetailEvent[];
  const boardRows = useQuery(
    api.workflows.listBoardRuns,
    selectedWorkflowId ? { workflowId: selectedWorkflowId, limit: 220 } : "skip"
  ) as BoardRunRow[] | undefined;
  const safeBoardRows = useMemo(() => {
    const rows = Array.isArray(boardRows) ? boardRows : [];
    return rows.filter(hasBoardRunId);
  }, [boardRows]);

  const activeWorkflow = useMemo(
    () => validWorkflows.find((w) => w.id === selectedWorkflowId) ?? null,
    [validWorkflows, selectedWorkflowId]
  );

  const mappingComplete = useMemo(() => {
    if (!mapping?.requiredSlots?.length) return false;
    return mapping.requiredSlots.every((slotId) => !!mappingDraft[slotId]?.agentId);
  }, [mapping, mappingDraft]);

  const agentOptions = useMemo(() => {
    const rows = [...validAgents].sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
    return rows.map((a) => ({
      value: a.id,
      label: `${a.name ?? a.id}${a.model ? ` - ${a.model}` : ""}`,
    }));
  }, [validAgents]);

  const workflowPickerOptions = useMemo(() => {
    return validWorkflows.map((w) => ({
      value: w.id,
      label: w.error ? `${w.id} (error)` : (w.name ?? w.id),
      disabled: !!w.error,
    }));
  }, [validWorkflows]);

  const slotOptions = useMemo(() => {
    const slots = activeWorkflow?.slots ?? [];
    return slots
      .filter((s): s is { id: string; role?: string | null; name?: string | null } => !!s && typeof s.id === "string")
      .map((s) => ({
      slotId: s.id,
      label: s.name || s.role || toTitleCase(s.id),
      details: s.role && s.name ? s.role : undefined,
      }));
  }, [activeWorkflow]);

  const slotLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const slot of slotOptions) {
      map.set(slot.slotId, slot.label);
    }
    return map;
  }, [slotOptions]);

  const boardColumns = useMemo(() => {
    const workerCols: WorkflowRunBoardColumn[] = slotOptions.map((slot) => {
      const draft = mappingDraft[slot.slotId];
      const mapped = validAgents.find((a) => a.id === draft?.agentId);
      const modelPrimary = draft?.modelPrimary?.trim() || "";
      const fallbackCount = Array.isArray(draft?.modelFallbacks) ? draft.modelFallbacks.length : 0;

      let description = mapped ? `${mapped.name ?? mapped.id}` : "No person assigned";
      if (modelPrimary) {
        description += ` • Model: ${modelPrimary}`;
      } else if (fallbackCount > 0) {
        description += ` • ${fallbackCount} backup model${fallbackCount === 1 ? "" : "s"}`;
      }

      return {
        id: `slot:${slot.slotId}`,
        title: slot.label,
        kind: "worker",
        description,
      };
    });

    return [
      {
        id: "attention",
        title: "Needs Attention",
        kind: "needs_attention" as const,
        description: "Runs waiting on you",
      },
      ...workerCols,
      {
        id: "done",
        title: "Done",
        kind: "done" as const,
        description: "Completed runs stay here until archived",
      },
    ];
  }, [slotOptions, mappingDraft, validAgents]);

  const slotColumnSet = useMemo(() => {
    return new Set(slotOptions.map((s) => s.slotId));
  }, [slotOptions]);

  const boardRunsById = useMemo(() => {
    const map = new Map<string, BoardRunRow>();
    for (const row of safeBoardRows) {
      map.set(row.run.id, row);
    }
    return map;
  }, [safeBoardRows]);

  const firstWorkerColumnId = useMemo(() => {
    return boardColumns.find((column) => column.kind === "worker")?.id ?? null;
  }, [boardColumns]);

  const runsByColumn = useMemo(() => {
    const byColumn: Record<string, WorkflowRunBoardRun[]> = {};
    for (const col of boardColumns) byColumn[col.id] = [];

    for (const row of safeBoardRows) {
      const run = row.run;
      const runStatus = String(run.status ?? "").toLowerCase();
      const stepStatus = String(row.activeStep?.status ?? "").toLowerCase();

      let columnId = "attention";
      if (ATTENTION_STATUSES.has(stepStatus) || ATTENTION_STATUSES.has(runStatus)) {
        columnId = "attention";
      } else if (runStatus === "completed" || runStatus === "cancelled") {
        columnId = "done";
      } else if (row.activeStep?.slotId && slotColumnSet.has(row.activeStep.slotId)) {
        columnId = `slot:${row.activeStep.slotId}`;
      } else if (runStatus === "running" && firstWorkerColumnId) {
        columnId = firstWorkerColumnId;
      }

      const title = run.title || run.input || run.id;
      const summary = row.latestEvent?.message || summaryFallback(run.status);
      const lockText = executionLockText(row.activeStep);
      const stage = row.activeStep
        ? `${slotLabelById.get(row.activeStep.slotId) ?? "Assigned lane"} - ${readableWorkflowStatus(row.activeStep.status)}`
        : readableWorkflowStatus(run.status);

      byColumn[columnId] = byColumn[columnId] ?? [];
      byColumn[columnId].push({
        id: run.id,
        title,
        status: run.status,
        summary,
        updatedAt: run.updatedAt ?? run.createdAt,
        executionLockText: lockText,
        preview: {
          title: stage,
          summary,
          note: `Current status: ${lockText}`,
        },
      });
    }

    return byColumn;
  }, [safeBoardRows, boardColumns, slotColumnSet, slotLabelById, firstWorkerColumnId]);

  const activeRunCount = useMemo(() => {
    return safeBoardRows.filter((row) => {
      const s = String(row.run.status ?? "").toLowerCase();
      return s === "running" || s === "paused" || s === "blocked";
    }).length;
  }, [safeBoardRows]);

  const queuedRunCount = useMemo(() => {
    return safeBoardRows.filter((row) => {
      const counts = row.stepCounts ?? {};
      return (counts.pending ?? 0) > 0 || (counts.waiting ?? 0) > 0;
    }).length;
  }, [safeBoardRows]);

  const selectedRunRow = useMemo(() => {
    if (!selectedRunId) return null;
    return boardRunsById.get(selectedRunId) ?? null;
  }, [boardRunsById, selectedRunId]);

  const selectedRunStatus =
    selectedRunRow?.run.status ?? (runDetail?.run?.status ? String(runDetail.run.status) : undefined);

  const selectedRunTitle =
    selectedRunRow?.run.title ??
    selectedRunRow?.run.input ??
    runDetail?.run?.title ??
    runDetail?.run?.input ??
    selectedRunId ??
    "Run";

  const retryFromOptions = useMemo(() => {
    if (!humanTargetStep || !runDetail?.steps) return [];
    const steps = (runDetail.steps ?? []) as RunDetailStep[];
    const before = steps.filter((s) => (s.stepIndex ?? 0) < (humanTargetStep.stepIndex ?? 0));
    before.sort((a, b) => (a.stepIndex ?? 0) - (b.stepIndex ?? 0));
    return before.map((s) => ({
      value: s.stepId,
      label: `#${(s.stepIndex ?? 0) + 1} ${toTitleCase(s.stepId)}`,
    }));
  }, [humanTargetStep, runDetail?.steps]);

  const runRetryOptions = useMemo(() => {
    const steps = (runDetail?.steps ?? []) as RunDetailStep[];
    if (steps.length === 0) return [];
    const sorted = [...steps].sort((a, b) => (a.stepIndex ?? 0) - (b.stepIndex ?? 0));
    return sorted.map((s) => ({
      value: s.stepId,
      label: `#${(s.stepIndex ?? 0) + 1} ${toTitleCase(s.stepId)}`,
    }));
  }, [runDetail?.steps]);

  async function loadWorkflowsAndAgents() {
    const [wf, list, models] = await Promise.all([
      fetchJson<{ ok: boolean; workflows: WorkflowListItem[] }>("/api/workflows/list"),
      fetchJson<AgentListItem[]>("/api/agents"),
      fetchJson<OpenClawModelsResponse>("/api/openclaw/models").catch(
        (): OpenClawModelsResponse => ({ ok: false, models: [] })
      ),
    ]);
    const safeWorkflows = Array.isArray(wf.workflows) ? wf.workflows.filter(isWorkflowListItem) : [];
    const safeAgents = Array.isArray(list) ? list.filter(isAgentListItem) : [];
    const modelRows = Array.isArray(models.models) ? models.models : [];
    const agentModelRows = uniqueModelOptionsFromAgents(safeAgents);
    if (modelRows.length > 0) {
      setSlotModelOptions([
        ...BASE_SLOT_MODEL_OPTIONS,
        ...modelRows.map((row) => ({ value: row.id, label: row.label })),
      ]);
    } else if (agentModelRows.length > 0) {
      setSlotModelOptions([...BASE_SLOT_MODEL_OPTIONS, ...agentModelRows]);
    } else {
      setSlotModelOptions(BASE_SLOT_MODEL_OPTIONS);
    }
    setWorkflows(safeWorkflows);
    setAgents(safeAgents);
    const firstOk = safeWorkflows.find((w) => !w.error)?.id;
    setSelectedWorkflowId((prev) => prev || firstOk || (safeWorkflows[0]?.id ?? ""));
  }

  async function loadWorkflowConfig(workflowId: string) {
    const [m, s] = await Promise.all([
      fetchJson<MappingResponse>(`/api/workflows/${workflowId}/mapping`),
      fetchJson<WorkflowSettingsResponse>(`/api/workflows/${workflowId}/settings`),
    ]);

    setMapping(m);
    const draft: Record<string, MappingDraftValue> = {};
    for (const row of m.mappings ?? []) {
      draft[row.slotId] = {
        agentId: row.agentId ?? "",
        modelPrimary: row.modelPrimary ?? "",
        modelFallbacks: Array.isArray(row.modelFallbacks) ? row.modelFallbacks : [],
      };
    }
    setMappingDraft(draft);
    setCronEveryMsDraft(s.settings?.cronEveryMs ?? 300_000);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadWorkflowsAndAgents();
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load workflows");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!selectedWorkflowId) return;
    setSelectedRunId(null);
    (async () => {
      try {
        await loadWorkflowConfig(selectedWorkflowId);
      } catch (err) {
        if (!cancelled) {
          setMapping(null);
          toast.error(err instanceof Error ? err.message : "Failed to load workflow settings");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedWorkflowId]);

  useEffect(() => {
    if (!composerOpen) return;
    const frame = window.requestAnimationFrame(() => {
      runInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [composerOpen]);

  useEffect(() => {
    if (runDialogOpen) return;
    // Keep modal state in sync so stale overlays do not linger.
    setHumanDialogOpen(false);
    setCancelDialogOpen(false);
    setRetryDialogOpen(false);
    setReassignDialogOpen(false);
  }, [runDialogOpen]);

  useEffect(() => {
    if (!laneSetupOpen) return;
    setSlotSettingsOpen(false);
  }, [laneSetupOpen]);

  useEffect(() => {
    if (!slotSettingsOpen) return;
    setLaneSetupOpen(false);
  }, [slotSettingsOpen]);

  useEffect(() => {
    if (safeBoardRows.length === 0) return;

    const now = Date.now();
    const activeRunIds = new Set<string>();
    const pendingAlerts: Array<{
      runId: string;
      severity: "attention" | "stall";
      title: string;
      reason: string;
      fingerprint: string;
      updatedAt: number;
    }> = [];

    for (const row of safeBoardRows) {
      const runId = row.run.id;
      activeRunIds.add(runId);

      const runStatus = String(row.run.status ?? "").toLowerCase();
      const stepStatus = String(row.activeStep?.status ?? "").toLowerCase();
      const eligible =
        ALERT_ELIGIBLE_RUN_STATUSES.has(runStatus) || ATTENTION_STATUSES.has(stepStatus);
      if (!eligible) {
        delete runAlertFingerprintRef.current[runId];
        continue;
      }
      const updatedAt = typeof row.run.updatedAt === "number" ? row.run.updatedAt : row.run.createdAt ?? 0;
      const title = (row.run.title || row.run.input || runId).trim();
      const baseReason =
        row.latestEvent?.message?.trim() ||
        (updatedAt > 0 ? `No update for ${msToHuman(now - updatedAt)}.` : executionLockText(row.activeStep));
      const reason = humanizeRunIssue(baseReason);

      const needsAttention = ATTENTION_STATUSES.has(runStatus) || ATTENTION_STATUSES.has(stepStatus);
      if (needsAttention) {
        const fingerprint = `attention:${runStatus}:${stepStatus}:${reason}`;
        const cooldownKey = `${runId}:${fingerprint}`;
        const cooldownUntil = runAlertCooldownUntil.get(cooldownKey) ?? 0;
        if (runAlertFingerprintRef.current[runId] !== fingerprint && cooldownUntil <= now) {
          runAlertCooldownUntil.set(cooldownKey, now + RUN_ALERT_COOLDOWN_MS);
          pendingAlerts.push({
            runId,
            severity: "attention",
            title,
            reason,
            fingerprint,
            updatedAt,
          });
        }
        continue;
      }

      const ageMs = updatedAt > 0 ? now - updatedAt : 0;
      const hasStalledByAge = runStatus === "running" && stepStatus !== "running" && ageMs >= RUN_STALL_MIN_AGE_MS;
      const leaseUntil = typeof row.activeStep?.leaseUntil === "number" ? row.activeStep.leaseUntil : null;
      const hasStalledLease = runStatus === "running" && leaseUntil !== null && leaseUntil <= now - STALE_LEASE_GRACE_MS;
      if (hasStalledByAge || hasStalledLease) {
        const fingerprint = `stall:${stepStatus}:${hasStalledByAge}:${hasStalledLease}:${reason}`;
        const cooldownKey = `${runId}:${fingerprint}`;
        const cooldownUntil = runAlertCooldownUntil.get(cooldownKey) ?? 0;
        if (runAlertFingerprintRef.current[runId] !== fingerprint && cooldownUntil <= now) {
          runAlertCooldownUntil.set(cooldownKey, now + RUN_ALERT_COOLDOWN_MS);
          pendingAlerts.push({
            runId,
            severity: "stall",
            title,
            reason,
            fingerprint,
            updatedAt,
          });
        }
      } else {
        // The run is healthy right now. Clear fingerprint so a future repeat issue re-notifies.
        delete runAlertFingerprintRef.current[runId];
      }
    }

    for (const runId of Object.keys(runAlertFingerprintRef.current)) {
      if (!activeRunIds.has(runId)) {
        delete runAlertFingerprintRef.current[runId];
      }
    }
    for (const [key, expiresAt] of runAlertCooldownUntil) {
      if (expiresAt <= now) runAlertCooldownUntil.delete(key);
    }
    for (const alert of pendingAlerts) {
      runAlertFingerprintRef.current[alert.runId] = alert.fingerprint;
    }
    if (pendingAlerts.length === 0) return;

    pendingAlerts.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    const visibleAlerts = pendingAlerts.slice(0, RUN_ALERT_MAX_PER_CYCLE);
    for (const alert of visibleAlerts) {
      const description = truncateToastReason(alert.reason);
      if (alert.severity === "attention") {
        toast.error(`Job needs attention: ${alert.title}`, { description });
      } else {
        toast.message(`Job may be stalled: ${alert.title}`, { description });
      }
    }
  }, [safeBoardRows]);

  async function saveRoleMapping() {
    if (!selectedWorkflowId || !mapping) return;
    setSavingMapping(true);
    try {
      const payload = {
        mappings: mapping.requiredSlots.map((slotId) => {
          const row = mappingDraft[slotId];
          return {
            slotId,
            agentId: row?.agentId ?? "",
            ...(row?.modelPrimary ? { modelPrimary: row.modelPrimary } : {}),
            ...(row?.modelFallbacks?.length ? { modelFallbacks: row.modelFallbacks } : {}),
          };
        }),
      };
      await fetchJson(`/api/workflows/${selectedWorkflowId}/mapping`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      await loadWorkflowConfig(selectedWorkflowId);
      toast.success("Lane assignments saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save lane assignments");
    } finally {
      setSavingMapping(false);
    }
  }

  async function installWorkflowAgents() {
    if (!selectedWorkflowId) return;
    setInstallingAgents(true);
    try {
      await fetchJson(`/api/workflows/${selectedWorkflowId}/install`, { method: "POST" });
      await loadWorkflowConfig(selectedWorkflowId);
      const list = await fetchJson<AgentListItem[]>("/api/agents");
      setAgents(Array.isArray(list) ? list.filter(isAgentListItem) : []);
      toast.success("Lane workers installed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Install failed");
    } finally {
      setInstallingAgents(false);
    }
  }

  async function saveSettings() {
    if (!selectedWorkflowId) return;
    setSavingSettings(true);
    try {
      await fetchJson(`/api/workflows/${selectedWorkflowId}/settings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cronEveryMs: cronEveryMsDraft }),
      });
      toast.success("Automatic checks saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save schedule");
    } finally {
      setSavingSettings(false);
    }
  }

  async function restartWorkflowCrons() {
    if (!selectedWorkflowId) return;
    setCronOpsBusy(true);
    try {
      await fetchJson(`/api/workflows/${selectedWorkflowId}/cron/restart`, { method: "POST" });
      toast.success("Automatic checks restarted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restart schedule");
    } finally {
      setCronOpsBusy(false);
    }
  }

  async function removeWorkflowCrons() {
    if (!selectedWorkflowId) return;
    setCronOpsBusy(true);
    try {
      await fetchJson(`/api/workflows/${selectedWorkflowId}/cron/remove`, { method: "POST" });
      toast.success("Automatic checks turned off");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove schedule");
    } finally {
      setCronOpsBusy(false);
    }
  }

  async function startRunFromDraft(
    draft: { input: string; title?: string },
    opts?: { openDialog?: boolean; quiet?: boolean }
  ): Promise<string | null> {
    const openDialog = opts?.openDialog !== false;
    const quiet = opts?.quiet === true;
    if (!selectedWorkflowId) return null;
    if (!mappingComplete) {
      if (!quiet) toast.error("Set up lanes before starting jobs.");
      return null;
    }
    const input = draft.input.trim();
    const title = (draft.title ?? "").trim();
    if (!input) {
      if (!quiet) toast.error("Add a task before starting.");
      return null;
    }

    try {
      const res = await fetchJson<{ ok: boolean; runId: string }>(`/api/workflows/${selectedWorkflowId}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input, title: title || undefined }),
      });
      if (openDialog) {
        setSelectedRunId(res.runId);
        setRunDialogOpen(true);
      }
      return res.runId;
    } catch (err) {
      if (!quiet) toast.error(err instanceof Error ? err.message : "Failed to start run");
      return null;
    }
  }

  async function createRun() {
    setCreatingRun(true);
    try {
      const runId = await startRunFromDraft({ input: runInput, title: runTitle }, { openDialog: true, quiet: false });
      if (!runId) return;
      setRunTitle("");
      setRunInput("");
      toast.success("Task started");
    } finally {
      setCreatingRun(false);
    }
  }

  function addDraftToQueue() {
    if (!mappingComplete) {
      toast.error("Set up lanes before queuing jobs.");
      return;
    }
    const input = runInput.trim();
    if (!input) {
      toast.error("Add a task before queuing.");
      return;
    }
    const title = runTitle.trim();
    setQueuedRunDrafts((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title,
        input,
      },
    ]);
    setRunTitle("");
    setRunInput("");
    toast.success("Added to queue");
  }

  function removeQueuedDraft(draftId: string) {
    setQueuedRunDrafts((prev) => prev.filter((d) => d.id !== draftId));
  }

  async function startSingleQueuedDraft(draftId: string) {
    const draft = queuedRunDrafts.find((d) => d.id === draftId);
    if (!draft) return;
    setStartingQueuedRuns(true);
    try {
      const runId = await startRunFromDraft(
        { title: draft.title, input: draft.input },
        { openDialog: true, quiet: false }
      );
      if (!runId) return;
      setQueuedRunDrafts((prev) => prev.filter((d) => d.id !== draftId));
      toast.success("Queued task started");
    } finally {
      setStartingQueuedRuns(false);
    }
  }

  async function startQueuedRuns() {
    if (queuedRunDrafts.length === 0) {
      toast.message("Queue is empty.");
      return;
    }
    if (!mappingComplete) {
      toast.error("Set up lanes before starting queued jobs.");
      return;
    }

    setStartingQueuedRuns(true);
    try {
      const pending = [...queuedRunDrafts];
      const results = await Promise.all(
        pending.map(async (draft) => {
          const runId = await startRunFromDraft(
            { title: draft.title, input: draft.input },
            { openDialog: false, quiet: true }
          );
          return { draft, runId };
        })
      );
      const failed = results.filter((result) => !result.runId).map((result) => result.draft);
      const startedRunIds = results
        .map((result) => result.runId)
        .filter((runId): runId is string => typeof runId === "string");

      setQueuedRunDrafts(failed);
      if (startedRunIds.length > 0) {
        const latestRunId = startedRunIds[startedRunIds.length - 1]!;
        setSelectedRunId(latestRunId);
        setRunDialogOpen(true);
      }

      if (startedRunIds.length > 0) {
        toast.success(
          failed.length > 0
            ? `${startedRunIds.length} task(s) started, ${failed.length} left in queue`
            : `${startedRunIds.length} task(s) started`
        );
      } else {
        toast.error("None of the queued tasks could be started.");
      }
    } finally {
      setStartingQueuedRuns(false);
    }
  }

  async function archiveRun(runId: string) {
    try {
      await fetchJson(`/api/workflows/runs/${runId}/archive`, { method: "POST" });
      if (selectedRunId === runId) {
        setRunDialogOpen(false);
      }
      toast.success("Run archived");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive run");
    }
  }

  function openRunDialog(run: WorkflowRunBoardRun) {
    setLaneSetupOpen(false);
    setSlotSettingsOpen(false);
    setSelectedRunId(run.id);
    setRunDialogOpen(true);
  }

  function openSlotSettingsFromColumn(column: WorkflowRunBoardColumn) {
    if (!column.id.startsWith("slot:")) return;
    const slotId = column.id.slice("slot:".length);
    const draft = mappingDraft[slotId] ?? { agentId: "", modelPrimary: "", modelFallbacks: [] };
    setSlotSettingsSlotId(slotId);
    setSlotSettingsAgentId(draft.agentId);
    setSlotSettingsModelPrimary(draft.modelPrimary || "");
    setSlotSettingsModelFallbacksCsv((draft.modelFallbacks ?? []).join(", "));
    setRunDialogOpen(false);
    setLaneSetupOpen(false);
    setSlotSettingsOpen(true);
  }

  function openLaneSetupDialog() {
    setRunDialogOpen(false);
    setSlotSettingsOpen(false);
    setLaneSetupOpen(true);
  }

  async function saveSlotSettings() {
    if (!selectedWorkflowId || !slotSettingsSlotId) return;
    if (!slotSettingsAgentId) {
      toast.error("Pick a person for this lane.");
      return;
    }

    setSlotSettingsBusy(true);
    try {
      const modelFallbacks = parseFallbacksCsv(slotSettingsModelFallbacksCsv);
      await fetchJson(`/api/workflows/${selectedWorkflowId}/slots/${slotSettingsSlotId}/settings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId: slotSettingsAgentId,
          modelPrimary: slotSettingsModelPrimary,
          modelFallbacks,
        }),
      });

      setMappingDraft((prev) => ({
        ...prev,
        [slotSettingsSlotId]: {
          agentId: slotSettingsAgentId,
          modelPrimary: slotSettingsModelPrimary,
          modelFallbacks,
        },
      }));
      await loadWorkflowConfig(selectedWorkflowId);
      setSlotSettingsOpen(false);
      toast.success("Lane settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save lane settings");
    } finally {
      setSlotSettingsBusy(false);
    }
  }

  function handleRunGoalKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.metaKey || event.ctrlKey) || event.key !== "Enter") return;
    event.preventDefault();
    if (!runInput.trim() || !mappingComplete || creatingRun) return;
    void createRun();
  }

  async function approveHumanStep(step: RunDetailStep) {
    setHumanBusy(true);
    try {
      const claimed = await fetchJson<ClaimResponse>("/api/workflows/steps/human/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stepId: step.id, agentId: step.agentId }),
      });
      if (!claimed?.found) {
        toast.message("No approval needed anymore.");
        return;
      }
      await fetchJson("/api/workflows/steps/human/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stepId: step.id,
          agentId: step.agentId,
          attemptId: claimed.attemptId,
          decision: "approve",
        }),
      });
      toast.success("Approved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setHumanBusy(false);
    }
  }

  function openRejectDialog(step: RunDetailStep) {
    setHumanTargetStep(step);
    setHumanFeedback("");
    setHumanRetryFrom(step.retryStepId ?? "");
    setHumanDialogOpen(true);
  }

  async function rejectHumanStep() {
    if (!humanTargetStep) return;
    setHumanBusy(true);
    try {
      const claimed = await fetchJson<ClaimResponse>("/api/workflows/steps/human/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stepId: humanTargetStep.id, agentId: humanTargetStep.agentId }),
      });
      if (!claimed?.found) {
        toast.message("No approval needed anymore.");
        return;
      }
      await fetchJson("/api/workflows/steps/human/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stepId: humanTargetStep.id,
          agentId: humanTargetStep.agentId,
          attemptId: claimed.attemptId,
          decision: "reject",
          feedback: humanFeedback,
          retryStepId: humanRetryFrom || undefined,
        }),
      });
      toast.success("Changes requested");
      setHumanDialogOpen(false);
      setHumanTargetStep(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request changes failed");
    } finally {
      setHumanBusy(false);
    }
  }

  async function pauseSelectedRun() {
    if (!selectedRunId) return;
    setRunOpsBusy(true);
    try {
      await fetchJson(`/api/workflows/runs/${selectedRunId}/pause`, { method: "POST" });
      toast.success("Run paused");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pause failed");
    } finally {
      setRunOpsBusy(false);
    }
  }

  async function resumeSelectedRun() {
    if (!selectedRunId) return;
    setRunOpsBusy(true);
    try {
      await fetchJson(`/api/workflows/runs/${selectedRunId}/resume`, { method: "POST" });
      toast.success("Run resumed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Resume failed");
    } finally {
      setRunOpsBusy(false);
    }
  }

  async function cancelSelectedRun() {
    if (!selectedRunId) return;
    setCancelBusy(true);
    try {
      await fetchJson(`/api/workflows/runs/${selectedRunId}/cancel`, { method: "POST" });
      toast.success("Run cancelled");
      setCancelDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setCancelBusy(false);
    }
  }

  function openRetryDialog() {
    const steps = runSteps;
    const failed = steps.find((s) => s.status === "failed" || s.status === "blocked");
    const defaultFrom = failed?.stepId ?? steps[0]?.stepId ?? "";
    setRetryFromStep(defaultFrom);
    setRetryFeedback("");
    setRetryDialogOpen(true);
  }

  async function retrySelectedRunFromStep() {
    if (!selectedRunId || !retryFromStep) {
      toast.error("Pick where to retry from.");
      return;
    }
    setRetryBusy(true);
    try {
      await fetchJson(`/api/workflows/runs/${selectedRunId}/retry-from-step`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          retryStepId: retryFromStep,
          feedback: retryFeedback || undefined,
        }),
      });
      toast.success("Run retried");
      setRetryDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetryBusy(false);
    }
  }

  async function extendLeaseForStep(step: RunDetailStep) {
    const stepId = typeof step?.id === "string" ? step.id : "";
    const agentId = typeof step?.agentId === "string" ? step.agentId : "";
    const attemptId = typeof step?.attemptId === "string" ? step.attemptId : "";
    if (!stepId || !agentId || !attemptId) {
      toast.error("Cannot extend lock right now.");
      return;
    }
    setLeaseBusyStepId(stepId);
    try {
      const res = await fetchJson<MutationResponse>("/api/workflows/steps/lease/extend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stepId, agentId, attemptId }),
      });
      if (res?.ok === false) throw new Error(res?.error || "Lock extend failed");
      toast.success("Execution lock extended");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Execution lock extend failed");
    } finally {
      setLeaseBusyStepId(null);
    }
  }

  async function forceReleaseLeaseForStep(step: RunDetailStep) {
    const stepId = typeof step?.id === "string" ? step.id : "";
    if (!stepId) return;
    setForceReleaseBusyStepId(stepId);
    try {
      const res = await fetchJson<MutationResponse>("/api/workflows/steps/lease/force-release", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stepId, reason: "operator_force_release" }),
      });
      if (res?.ok === false) throw new Error(res?.error || "Lock release failed");
      toast.success("Execution lock released");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Execution lock release failed");
    } finally {
      setForceReleaseBusyStepId(null);
    }
  }

  function openReassignDialog(step: RunDetailStep) {
    setReassignTargetStep(step);
    setReassignAgentId("");
    setReassignDialogOpen(true);
  }

  async function submitReassign() {
    if (!reassignTargetStep || !reassignAgentId) {
      toast.error("Pick a person for this stage.");
      return;
    }
    setReassignBusy(true);
    try {
      const res = await fetchJson<MutationResponse>("/api/workflows/steps/reassign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stepId: reassignTargetStep.id, newAgentId: reassignAgentId }),
      });
      if (res?.ok === false) throw new Error(res?.error || "Reassign failed");
      toast.success("Stage reassigned");
      setReassignDialogOpen(false);
      setReassignTargetStep(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reassign failed");
    } finally {
      setReassignBusy(false);
    }
  }

  return (
    <div className="h-full min-h-0 w-full min-w-0 overflow-x-hidden flex flex-col workflow-surface">
      <div className="flex flex-wrap items-start gap-3 p-3 lg:p-4 border-b border-[var(--border-subtle)]">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="wf-title-chip">Jobs board</div>
            <Badge variant="secondary" size="sm">{activeRunCount} active</Badge>
            <Badge variant="secondary" size="sm">{queuedRunCount} queued</Badge>
          </div>
          <div className="mt-1 text-xs text-[var(--text-dim)]">
            One card per job. Jobs move left-to-right automatically and stay visible when done until archived.
          </div>
        </div>
        <div className="w-full sm:w-[280px] sm:max-w-[40vw]">
          <Select
            options={workflowPickerOptions}
            value={selectedWorkflowId}
            onChange={(e) => setSelectedWorkflowId(e.target.value)}
            placeholder="Pick workflow"
            size="sm"
          />
        </div>
      </div>

      <div className="px-3 lg:px-4 pt-3 lg:pt-4">
        <GlassPanel padding="sm" className="wf-card">
          <div className="text-xs font-semibold tracking-wide text-[var(--text-muted)]">Quick add jobs</div>
          <div className="mt-1 text-[11px] text-[var(--text-dim)]">
            Add one or more jobs, queue them, then start together.
          </div>

          <details className="mt-3 rounded-md border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.01)] p-2">
            <summary className="cursor-pointer select-none text-[11px] font-semibold text-[var(--text-muted)]">
              What to expect
            </summary>
            <div className="mt-2 space-y-1 text-[11px] leading-5 text-[var(--text-dim)]">
              <div>1. Open <strong>Lane setup</strong> once and assign one person to each lane.</div>
              <div>2. Every job you start becomes one card.</div>
              <div>3. Cards move automatically; this board does not use drag-and-drop.</div>
              <div>4. If a run needs your input, it moves to <strong>Needs attention</strong>.</div>
              <div>5. Completed runs stay in <strong>Done</strong> until you archive them.</div>
              <div>6. Use <strong>Lane settings</strong> in a lane header for lane-only model overrides.</div>
            </div>
          </details>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" size="sm">
              {queuedRunDrafts.length} queued
            </Badge>
            <Button variant="default" size="sm" onClick={() => setComposerOpen((v) => !v)}>
              {composerOpen ? "Close quick add" : "Open quick add"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={startQueuedRuns}
              disabled={queuedRunDrafts.length === 0 || !mappingComplete}
              loading={startingQueuedRuns}
            >
              Start all queued
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={openLaneSetupDialog}
              disabled={!selectedWorkflowId}
            >
              Lane setup
            </Button>
          </div>

          {composerOpen ? (
            <>
              <div className="mt-3 grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
                <Input
                  label="Name (optional)"
                  value={runTitle}
                  onChange={(e) => setRunTitle(e.target.value)}
                  placeholder="Homepage refresh"
                  size="sm"
                />
                <Textarea
                  ref={runInputRef}
                  label="What should this job do?"
                  value={runInput}
                  onChange={(e) => setRunInput(e.target.value)}
                  onKeyDown={handleRunGoalKeyDown}
                  placeholder="Describe the result you want."
                  rows={2}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  mappedIcon="play"
                  onClick={createRun}
                  disabled={!runInput.trim() || !mappingComplete}
                  loading={creatingRun}
                >
                  Start now
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={addDraftToQueue}
                  disabled={!runInput.trim() || !mappingComplete}
                >
                  Add to queue
                </Button>
                <span className="w-full text-[11px] text-[var(--text-dim)] sm:w-auto">Cmd/Ctrl + Enter starts now</span>
              </div>
            </>
          ) : null}

          <details className="mt-3 rounded-md border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.01)] p-2">
            <summary className="cursor-pointer select-none text-[11px] font-semibold text-[var(--text-muted)]">
              Automation timing (advanced)
            </summary>
            <div className="mt-2 grid gap-2 md:grid-cols-[240px_1fr] md:items-end">
              <Select
                label="Check every"
                hint="How often queued jobs are checked. Recommended default is every 5 minutes."
                value={String(cronEveryMsDraft)}
                onChange={(e) => setCronEveryMsDraft(Number(e.target.value))}
                options={[
                  { value: "60000", label: "Every minute" },
                  { value: "300000", label: "Every 5 minutes" },
                  { value: "900000", label: "Every 15 minutes" },
                  { value: "3600000", label: "Every hour" },
                ]}
                size="sm"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={saveSettings} loading={savingSettings}>
                  Save schedule
                </Button>
                <Button variant="outline" size="sm" onClick={restartWorkflowCrons} loading={cronOpsBusy}>
                  Restart checks
                </Button>
                <Button variant="destructive" size="sm" onClick={removeWorkflowCrons} loading={cronOpsBusy}>
                  Turn off checks
                </Button>
              </div>
            </div>
          </details>

          {!mappingComplete ? (
            <div className="mt-2 text-[11px] text-[var(--accent-warning)]">
              Set up lanes before starting jobs.
            </div>
          ) : null}

          <details className="mt-2 rounded-md border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.01)] p-2">
            <summary className="cursor-pointer select-none text-[11px] font-semibold text-[var(--text-muted)]">
              Custom workflows (advanced)
            </summary>
            <div className="mt-2 text-[11px] text-[var(--text-dim)] leading-5">
              Built-in templates are loaded from the local <code>/workflows</code> folder.
              To add your own, duplicate a workflow folder and edit its <code>workflow.yml</code>.
            </div>
          </details>

          {queuedRunDrafts.length > 0 ? (
            <div className="mt-3 rounded-lg border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] p-2">
              <div className="text-[11px] font-semibold text-[var(--text-muted)]">Queued jobs</div>
              <div className="mt-2 flex max-h-48 flex-col gap-2 overflow-y-auto pr-1 wf-scroll">
                {queuedRunDrafts.map((draft, index) => (
                  <div
                    key={draft.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.01)] px-2 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-[var(--text-primary)] truncate">
                        {draft.title || `Task ${index + 1}`}
                      </div>
                      <div className="text-[11px] text-[var(--text-dim)] truncate">{draft.input}</div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startSingleQueuedDraft(draft.id)}
                      loading={startingQueuedRuns}
                    >
                      Run
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeQueuedDraft(draft.id)}
                      disabled={startingQueuedRuns}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </GlassPanel>
      </div>

      <div className="flex-1 min-h-0 p-3 lg:p-4">
        <WorkflowRunBoard
          columns={boardColumns}
          runsByColumn={runsByColumn}
          onOpenRun={(run) => openRunDialog(run)}
          onOpenSlotSettings={(column) => openSlotSettingsFromColumn(column)}
          onArchiveRun={(run) => archiveRun(run.id)}
          slotSettingsLabel="Lane settings"
          archiveLabel="Archive"
          getEmptyColumnCopy={(column) => {
            if (column.id === "attention") return "Nothing blocked right now.";
            if (column.id === "done") return "Completed runs stay here until you archive them.";
            return "No runs in this lane yet.";
          }}
        />
      </div>

      <Dialog open={runDialogOpen} onOpenChange={setRunDialogOpen}>
        <DialogContent className="w-[min(960px,96vw)] max-w-[960px] max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedRunTitle}</DialogTitle>
            <DialogDescription>
              Track status, stage-by-stage progress, and the latest updates for this run.
            </DialogDescription>
          </DialogHeader>

          {!selectedRunId ? (
            <div className="text-sm text-[var(--text-dim)]">Select a run card to open details.</div>
          ) : !runDetail ? (
            <div className="text-sm text-[var(--text-dim)]">Loading run details…</div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" size="sm">{readableWorkflowStatus(selectedRunStatus)}</Badge>
                </div>

                <div className="flex items-center gap-2">
                  {(selectedRunStatus === "failed" || selectedRunStatus === "blocked") && (
                    <Button variant="outline" size="sm" onClick={openRetryDialog} disabled={runOpsBusy}>
                      Retry from stage
                    </Button>
                  )}
                  {selectedRunStatus === "running" && (
                    <Button variant="outline" size="sm" onClick={pauseSelectedRun} loading={runOpsBusy}>
                      Pause
                    </Button>
                  )}
                  {selectedRunStatus === "paused" && (
                    <Button variant="outline" size="sm" onClick={resumeSelectedRun} loading={runOpsBusy}>
                      Resume
                    </Button>
                  )}
                  {(selectedRunStatus === "running" ||
                    selectedRunStatus === "blocked" ||
                    selectedRunStatus === "paused") && (
                    <Button variant="destructive" size="sm" onClick={() => setCancelDialogOpen(true)} disabled={runOpsBusy}>
                      Cancel
                    </Button>
                  )}
                  {selectedRunStatus === "completed" && (
                    <Button variant="secondary" size="sm" onClick={() => archiveRun(selectedRunId)}>
                      Archive
                    </Button>
                  )}
                </div>
              </div>

              <GlassPanel padding="md" className="wf-card">
                <div className="text-xs font-semibold tracking-wide text-[var(--text-muted)]">Current summary</div>
                <div className="mt-2 text-sm text-[var(--text-secondary)]">
                  {selectedRunRow?.latestEvent?.message || summaryFallback(selectedRunStatus)}
                </div>
              </GlassPanel>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <GlassPanel padding="md" className="wf-card">
                  <div className="text-xs font-semibold tracking-wide text-[var(--text-muted)]">Stages</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {runSteps.map((s) => {
                      const lockText = executionLockText({
                        id: s.id,
                        stepId: s.stepId,
                        stepIndex: s.stepIndex,
                        slotId: s.slotId,
                        agentId: s.agentId,
                        status: s.status,
                        leaseOwner: s.leaseOwner,
                        leaseUntil: s.leaseUntil,
                      });

                      return (
                          <div key={s.id} className={stepPillClass(s.status)}>
                            <div className="wf-step-top">
                              <div className="wf-step-idx">#{(s.stepIndex ?? 0) + 1}</div>
                              <div className="wf-step-id" title={toTitleCase(s.stepId)}>{toTitleCase(s.stepId)}</div>
                              <div className="wf-step-slot" title={slotLabelById.get(s.slotId) ?? "Assigned lane"}>
                                {slotLabelById.get(s.slotId) ?? "Assigned lane"}
                              </div>
                            </div>
                          <div className="wf-step-meta">
                            <span className={cn("wf-step-status", `wf-step-status--${s.status}`)}>
                              {readableWorkflowStatus(s.status)}
                            </span>
                            <span className="wf-step-lease">{lockText}</span>
                          </div>

                          {s.status === "running" && (
                            <div className="mt-2 flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => extendLeaseForStep(s)}
                                loading={leaseBusyStepId === s.id}
                              >
                                Extend lock
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => forceReleaseLeaseForStep(s)}
                                loading={forceReleaseBusyStepId === s.id}
                              >
                                Release lock
                              </Button>
                            </div>
                          )}

                          {s.status === "needs_human" && (
                            <div className="mt-2 flex items-center gap-2">
                              <Button
                                variant="success"
                                size="sm"
                                onClick={() => approveHumanStep(s)}
                                loading={humanBusy}
                              >
                                Approve
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => openRejectDialog(s)}
                                disabled={humanBusy}
                              >
                                Request changes
                              </Button>
                            </div>
                          )}

                          {s.status !== "done" && s.status !== "running" && (
                            <div className="mt-2 flex items-center gap-2">
                              <Button variant="outline" size="sm" onClick={() => openReassignDialog(s)} disabled={reassignBusy}>
                                Reassign
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </GlassPanel>

                <GlassPanel padding="md" className="wf-card flex flex-col min-h-[280px]">
                  <div className="text-xs font-semibold tracking-wide text-[var(--text-muted)]">Latest updates</div>
                  <div className="mt-3 flex-1 min-h-0 overflow-auto wf-scroll">
                    {runEvents.length === 0 ? (
                      <div className="text-sm text-[var(--text-dim)] p-2">No updates yet.</div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {runEvents.map((ev) => (
                          <div key={ev.id} className="wf-event-row">
                            <div className="wf-event-top">
                              <div className="wf-event-type">{toTitleCase(ev.type)}</div>
                              <div className="wf-event-time">
                                <TimeAgo timestamp={ev.createdAt} />
                              </div>
                            </div>
                            <div className="wf-event-msg">{ev.message}</div>
                            {(ev.agentId || ev.stepId) && (
                              <div className="wf-event-meta">
                                {ev.agentId && (
                                  <span className="wf-event-chip">
                                    <AgentAvatar agentId={ev.agentId} name={ev.agentId} size="sm" />
                                    <span className="font-mono">{ev.agentId}</span>
                                  </span>
                                )}
                                {ev.stepId && <span className="wf-event-chip font-mono">{ev.stepId}</span>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </GlassPanel>
              </div>

              <GlassPanel padding="md" className="wf-card">
                <div className="text-xs font-semibold tracking-wide text-[var(--text-muted)]">Run context</div>
                <div className="mt-3 wf-context">
                  {runDetail.run?.context && typeof runDetail.run.context === "object" ? (
                    Object.entries(runDetail.run.context as Record<string, unknown>)
                      .slice(0, 30)
                      .map(([k, v]) => (
                        <div key={k} className="wf-context-row">
                          <div className="wf-context-key">{k}</div>
                          <div className="wf-context-val">{typeof v === "string" ? v : JSON.stringify(v)}</div>
                        </div>
                      ))
                  ) : (
                    <div className="text-sm text-[var(--text-dim)]">No context yet.</div>
                  )}
                </div>
              </GlassPanel>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={laneSetupOpen} onOpenChange={setLaneSetupOpen}>
        <DialogContent className="w-[min(760px,96vw)] max-w-[760px] max-h-[92dvh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Set up lanes</DialogTitle>
            <DialogDescription>
              Assign one person to each lane so queued jobs can move automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-[var(--text-dim)]">
            Pick who owns each lane. Once lanes are assigned, queued jobs can move through the board automatically.
          </div>
          <div className="mt-2 rounded-md border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] p-2 text-[11px] text-[var(--text-dim)]">
            Need workers first? Use <strong>Create lane workers</strong>. It creates one workflow worker profile per lane.
          </div>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 wf-scroll">
            {!mappingComplete ? (
              <EmptyState
                title="Assign every lane"
                description="Each lane needs one person before jobs can start."
              />
            ) : null}

            {slotOptions.length > 0 ? (
              <div className="mt-3 flex flex-col gap-3">
                {slotOptions.map((slot) => (
                  <div key={slot.slotId} className="wf-mapping-row">
                    <div>
                      <div className="wf-mapping-slotid">{slot.label}</div>
                      {slot.details ? <div className="wf-mapping-slotlabel">{slot.details}</div> : null}
                    </div>
                    <Select
                      options={agentOptions}
                      placeholder="Assign person"
                      value={mappingDraft[slot.slotId]?.agentId ?? ""}
                      onChange={(e) =>
                        setMappingDraft((prev) => ({
                          ...prev,
                          [slot.slotId]: {
                            agentId: e.target.value,
                            modelPrimary: prev[slot.slotId]?.modelPrimary ?? "",
                            modelFallbacks: prev[slot.slotId]?.modelFallbacks ?? [],
                          },
                        }))
                      }
                      size="sm"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-[var(--text-dim)]">No lanes found for this workflow.</div>
            )}
          </div>
          <DialogFooter className="flex-wrap justify-start sm:justify-end gap-2 sm:gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={installWorkflowAgents}
              loading={installingAgents}
              disabled={!selectedWorkflowId}
              className="w-full sm:w-auto"
            >
              Create lane workers
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setLaneSetupOpen(false)}
              disabled={savingMapping || installingAgents}
              className="w-full sm:w-auto"
            >
              Close
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={saveRoleMapping}
              loading={savingMapping}
              disabled={!mapping?.requiredSlots?.every((s) => !!mappingDraft[s]?.agentId)}
              className="w-full sm:w-auto"
            >
              Save lane assignments
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={slotSettingsOpen} onOpenChange={setSlotSettingsOpen}>
        <DialogContent className="w-[min(680px,96vw)] max-w-[680px] max-h-[92dvh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Lane settings</DialogTitle>
            <DialogDescription>
              Change person or model preferences for this lane only in this workflow.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-[var(--text-dim)]">
            These settings apply only to this lane in this workflow. They do not change global defaults.
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            Lane: {slotLabelById.get(slotSettingsSlotId) ?? toTitleCase(slotSettingsSlotId)}
          </div>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 wf-scroll">
            <FormGroup columns={2} gap="md">
              <Select
                label="Assigned person"
                options={agentOptions}
                value={slotSettingsAgentId}
                onChange={(e) => setSlotSettingsAgentId(e.target.value)}
                placeholder="Pick person"
                size="sm"
              />
              <Select
                label="Preferred model"
                options={slotModelOptions}
                value={slotSettingsModelPrimary}
                onChange={(e) => setSlotSettingsModelPrimary(e.target.value)}
                size="sm"
              />
            </FormGroup>
            <Input
              className="mt-3"
              label="Backup models (optional)"
              value={slotSettingsModelFallbacksCsv}
              onChange={(e) => setSlotSettingsModelFallbacksCsv(e.target.value)}
              placeholder="model-a, model-b"
              size="sm"
            />
            <div className="mt-2 text-[11px] text-[var(--text-dim)]">
              Model options come from your OpenClaw config. Save here to keep this override on this lane only.
            </div>
          </div>
          <DialogFooter className="flex-wrap justify-start sm:justify-end gap-2 sm:gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSlotSettingsOpen(false)}
              disabled={slotSettingsBusy}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={saveSlotSettings}
              loading={slotSettingsBusy}
              className="w-full sm:w-auto"
            >
              Save lane settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={humanDialogOpen} onOpenChange={setHumanDialogOpen}>
        <DialogContent className="w-[min(720px,96vw)] max-w-[720px] max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request changes</DialogTitle>
            <DialogDescription>
              Share feedback and choose where this run should continue.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 text-sm text-[var(--text-dim)]">
            Send feedback and choose where this run should resume.
          </div>
          <div className="mt-4">
            <Select
              label="Retry from stage"
              options={[{ value: "", label: "Auto" }, ...retryFromOptions]}
              value={humanRetryFrom}
              onChange={(e) => setHumanRetryFrom(e.target.value)}
              size="sm"
            />
          </div>
          <div className="mt-3">
            <Textarea
              label="Feedback"
              value={humanFeedback}
              onChange={(e) => setHumanFeedback(e.target.value)}
              placeholder="What should change?"
              rows={6}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setHumanDialogOpen(false)} disabled={humanBusy}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={rejectHumanStep} loading={humanBusy}>
              Request changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="w-[min(640px,96vw)] max-w-[640px] max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cancel this run?</DialogTitle>
            <DialogDescription>
              This will stop the run and remove it from active execution.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 text-sm text-[var(--text-dim)]">
            This stops the run and removes it from active execution.
          </div>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setCancelDialogOpen(false)} disabled={cancelBusy}>
              Keep running
            </Button>
            <Button variant="destructive" size="sm" onClick={cancelSelectedRun} loading={cancelBusy}>
              Cancel run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={retryDialogOpen} onOpenChange={setRetryDialogOpen}>
        <DialogContent className="w-[min(720px,96vw)] max-w-[720px] max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Retry run</DialogTitle>
            <DialogDescription>
              Choose the stage to retry from and optionally add guidance.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 text-sm text-[var(--text-dim)]">
            Choose where to retry and optionally leave notes for the next attempt.
          </div>
          <div className="mt-4">
            <Select
              label="Retry from stage"
              options={runRetryOptions}
              value={retryFromStep}
              onChange={(e) => setRetryFromStep(e.target.value)}
              size="sm"
            />
          </div>
          <div className="mt-3">
            <Textarea
              label="Feedback (optional)"
              value={retryFeedback}
              onChange={(e) => setRetryFeedback(e.target.value)}
              placeholder="What should improve this attempt?"
              rows={6}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setRetryDialogOpen(false)} disabled={retryBusy}>
              Cancel
            </Button>
            <Button variant="default" size="sm" onClick={retrySelectedRunFromStep} loading={retryBusy}>
              Retry run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reassignDialogOpen} onOpenChange={setReassignDialogOpen}>
        <DialogContent className="w-[min(720px,96vw)] max-w-[720px] max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reassign stage</DialogTitle>
            <DialogDescription>
              Move this stage to a different person for the current run.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 text-sm text-[var(--text-dim)]">
            Move this stage to a different person for the current run.
          </div>
          <div className="mt-4">
            <Select
              label="New person"
              options={agentOptions}
              value={reassignAgentId}
              onChange={(e) => setReassignAgentId(e.target.value)}
              placeholder="Pick person"
              size="sm"
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setReassignDialogOpen(false)} disabled={reassignBusy}>
              Cancel
            </Button>
            <Button variant="default" size="sm" onClick={submitReassign} loading={reassignBusy}>
              Reassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default WorkflowsPanel;
