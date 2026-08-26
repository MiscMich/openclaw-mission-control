export type WorkflowAgentRole =
  | "analysis"
  | "coding"
  | "verification"
  | "testing"
  | "pr"
  | "scanning";

export type WorkflowAgentSpec = {
  id: string;
  name?: string;
  description?: string;
  role?: WorkflowAgentRole;
  // Antfarm-style workspace provisioning exists in the reference spec, but OpenClaw Mission Control
  // does not depend on it for execution. We parse and preserve it for future use.
  workspace?: {
    baseDir?: string;
    files?: Record<string, string>;
    skills?: string[];
  };
};

export type WorkflowLoopConfig = {
  over: "stories";
  completion: "all_done";
  fresh_session?: boolean;
  verify_each?: boolean;
  verify_step?: string;
};

export type WorkflowStepFailureSpec = {
  retry_step?: string;
  max_retries?: number;
  on_exhausted?: { escalate_to?: string };
  escalate_to?: string;
};

export type WorkflowStepSpec = {
  id: string;
  agent: string; // references agents[].id (slot id)
  type?: "single" | "loop";
  loop?: WorkflowLoopConfig;
  // Human approval gate. When true, this step enters status "needs_human" when it becomes ready.
  // It must be explicitly resolved by the operator (approve/reject) and is not claimed by cron turns.
  needs_human?: boolean;
  input: string;
  expects: string;
  max_retries?: number;
  on_fail?: WorkflowStepFailureSpec;
};

export type WorkflowCronSpec = {
  interval_ms?: number;
};

export type WorkflowSpec = {
  id: string;
  name?: string;
  version?: number;
  description?: string;
  agents: WorkflowAgentSpec[];
  steps: WorkflowStepSpec[];
  context?: Record<string, string>;
  cron?: WorkflowCronSpec;
};
