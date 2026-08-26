import { describe, expect, it } from "vitest";
import {
  assertActiveLease,
  createAuditEvent,
  evaluateRetry,
  readyStatusForStep,
  shouldRequeueExpiredLease,
} from "./invariants";

describe("workflow runtime invariants", () => {
  const now = 1_800_000_000_000;

  it("enforces lease ownership, attempt identity, and expiry", () => {
    const lease = { status: "running", leaseOwner: "worker-a", attemptId: "attempt-1", leaseUntil: now + 1_000 };
    expect(() => assertActiveLease(lease, { agentId: "worker-a", attemptId: "attempt-1", now })).not.toThrow();
    expect(() => assertActiveLease(lease, { agentId: "worker-b", attemptId: "attempt-1", now })).toThrow(/another agent/i);
    expect(() => assertActiveLease(lease, { agentId: "worker-a", attemptId: "old", now })).toThrow(/stale/i);
    expect(() => assertActiveLease(lease, { agentId: "worker-a", attemptId: "attempt-1", now: now + 1_001 })).toThrow(/expired/i);
  });

  it("only requeues running leases after expiry", () => {
    expect(shouldRequeueExpiredLease({ status: "running", leaseUntil: now - 1 }, now)).toBe(true);
    expect(shouldRequeueExpiredLease({ status: "running", leaseUntil: now + 1 }, now)).toBe(false);
    expect(shouldRequeueExpiredLease({ status: "done", leaseUntil: now - 1 }, now)).toBe(false);
  });

  it("bounds retries without an off-by-one extra attempt", () => {
    expect(evaluateRetry(0, 2)).toEqual({ retryCount: 1, exhausted: false });
    expect(evaluateRetry(1, 2)).toEqual({ retryCount: 2, exhausted: false });
    expect(evaluateRetry(2, 2)).toEqual({ retryCount: 2, exhausted: true });
  });

  it("turns human steps into approval gates instead of claimable work", () => {
    expect(readyStatusForStep(false)).toBe("pending");
    expect(readyStatusForStep(true)).toBe("needs_human");
  });

  it("creates attributable, timestamped audit events", () => {
    expect(createAuditEvent({ id: "event-1", runId: "run-1", type: "lease_expired", actorId: "system", at: now })).toEqual({
      id: "event-1",
      runId: "run-1",
      type: "lease_expired",
      actorId: "system",
      at: now,
    });
  });
});
