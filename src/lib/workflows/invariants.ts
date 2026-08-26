export type LeaseState = {
  status: string;
  leaseOwner?: string;
  attemptId?: string;
  leaseUntil?: number;
};

export function shouldRequeueExpiredLease(step: LeaseState, now: number): boolean {
  return step.status === "running" && typeof step.leaseUntil === "number" && step.leaseUntil < now;
}

export function assertActiveLease(
  step: LeaseState,
  claim: { agentId: string; attemptId: string; now: number }
): void {
  if (step.status !== "running") throw new Error("Step does not have an active lease");
  if (step.attemptId !== claim.attemptId) throw new Error("Stale attemptId (step was re-claimed)");
  if (step.leaseOwner !== claim.agentId) throw new Error("Step is leased by another agent");
  if (typeof step.leaseUntil !== "number" || step.leaseUntil < claim.now) throw new Error("Step lease has expired");
}

export function evaluateRetry(retryCount: number, maxRetries: number): {
  retryCount: number;
  exhausted: boolean;
} {
  const boundedMax = Math.max(0, Math.floor(maxRetries));
  const current = Math.max(0, Math.floor(retryCount));
  if (current >= boundedMax) return { retryCount: current, exhausted: true };
  return { retryCount: current + 1, exhausted: false };
}

export function readyStatusForStep(needsHuman: boolean): "pending" | "needs_human" {
  return needsHuman ? "needs_human" : "pending";
}

export type WorkflowAuditEvent = {
  id: string;
  runId: string;
  type: string;
  actorId: string;
  at: number;
  message?: string;
};

export function createAuditEvent(event: WorkflowAuditEvent): WorkflowAuditEvent {
  if (!event.id || !event.runId || !event.type || !event.actorId || !Number.isFinite(event.at)) {
    throw new Error("Audit events require id, runId, type, actorId, and timestamp");
  }
  return Object.freeze({ ...event });
}
