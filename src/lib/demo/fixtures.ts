export type DemoStepStatus = "done" | "running" | "retrying" | "needs_human" | "waiting";

export type DemoStep = {
  id: string;
  label: string;
  owner: string;
  status: DemoStepStatus;
  detail: string;
  retryCount?: number;
  maxRetries?: number;
  leaseUntil?: string;
};

export type DemoRun = {
  id: string;
  title: string;
  workflow: string;
  created: string;
  progress: number;
  steps: DemoStep[];
};

export const demoAgents = [
  { id: "coordinator", name: "Coordinator", role: "Plans and routes work", status: "active", color: "#7c6df2" },
  { id: "builder", name: "Builder", role: "Implements scoped changes", status: "working", color: "#41b883" },
  { id: "reviewer", name: "Reviewer", role: "Checks quality and policy", status: "reviewing", color: "#e6a23c" },
  { id: "observer", name: "Observer", role: "Tracks health and events", status: "idle", color: "#4ca5ff" },
] as const;

export const initialDemoRuns: DemoRun[] = [
  {
    id: "run-001",
    title: "Prepare release candidate",
    workflow: "Release readiness",
    created: "09:00",
    progress: 58,
    steps: [
      { id: "scope", label: "Define scope", owner: "Coordinator", status: "done", detail: "Output accepted" },
      { id: "build", label: "Apply changes", owner: "Builder", status: "running", detail: "Lease owned by Builder", leaseUntil: "11 min" },
      { id: "verify", label: "Verify output", owner: "Reviewer", status: "retrying", detail: "Retry 1 of 2", retryCount: 1, maxRetries: 2 },
      { id: "approve", label: "Release approval", owner: "Operator", status: "needs_human", detail: "Explicit approval required" },
    ],
  },
  {
    id: "run-002",
    title: "Triage incoming issue",
    workflow: "Issue response",
    created: "08:42",
    progress: 76,
    steps: [
      { id: "triage", label: "Classify issue", owner: "Coordinator", status: "done", detail: "Priority recorded" },
      { id: "investigate", label: "Investigate", owner: "Observer", status: "done", detail: "Evidence attached" },
      { id: "fix", label: "Prepare fix", owner: "Builder", status: "running", detail: "Lease owned by Builder", leaseUntil: "7 min" },
      { id: "review", label: "Review fix", owner: "Reviewer", status: "waiting", detail: "Waiting for fix" },
    ],
  },
];

export const initialAuditEvents = [
  { id: "audit-005", time: "09:14:22", actor: "Reviewer", type: "retry_scheduled", message: "Verification requested retry 1 of 2" },
  { id: "audit-004", time: "09:12:08", actor: "Builder", type: "lease_extended", message: "Lease extended for Apply changes" },
  { id: "audit-003", time: "09:09:31", actor: "Operator", type: "approval_gate", message: "Release approval gate opened" },
  { id: "audit-002", time: "09:03:44", actor: "Builder", type: "step_claimed", message: "Apply changes claimed with a 15 minute lease" },
  { id: "audit-001", time: "09:00:00", actor: "Coordinator", type: "run_created", message: "Release readiness run created" },
];

export const initialMessages = [
  { id: "message-1", from: "Coordinator", body: "Scope is ready. I routed implementation to Builder.", time: "09:02" },
  { id: "message-2", from: "Builder", body: "Working through the release checklist now.", time: "09:06" },
  { id: "message-3", from: "Reviewer", body: "One verification check needs a bounded retry.", time: "09:14" },
];
