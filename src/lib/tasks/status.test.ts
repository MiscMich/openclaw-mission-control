import { describe, expect, it } from "vitest";
import {
  ACTIVE_TASK_STATUS_VALUES,
  COMPLETED_TASK_STATUS_VALUES,
  TASK_STATUS_PRIORITY,
  TASK_STATUS_VALUES,
  isActiveTaskStatus,
  isCompletedTaskStatus,
  isTaskStatus,
} from "./status";

describe("task status utility", () => {
  it("accepts every configured status value", () => {
    for (const status of TASK_STATUS_VALUES) {
      expect(isTaskStatus(status)).toBe(true);
    }
  });

  it("rejects unknown status values", () => {
    expect(isTaskStatus("queued")).toBe(false);
    expect(isTaskStatus("canceled")).toBe(false);
    expect(isTaskStatus("")).toBe(false);
  });

  it("marks only active statuses as active", () => {
    for (const status of ACTIVE_TASK_STATUS_VALUES) {
      expect(isActiveTaskStatus(status)).toBe(true);
    }
    expect(isActiveTaskStatus("done")).toBe(false);
  });

  it("marks only completed statuses as completed", () => {
    for (const status of COMPLETED_TASK_STATUS_VALUES) {
      expect(isCompletedTaskStatus(status)).toBe(true);
    }
    expect(isCompletedTaskStatus("review")).toBe(false);
  });

  it("keeps active status priority ordered", () => {
    expect(TASK_STATUS_PRIORITY.in_progress).toBeGreaterThan(TASK_STATUS_PRIORITY.review);
    expect(TASK_STATUS_PRIORITY.review).toBeGreaterThan(TASK_STATUS_PRIORITY.assigned);
  });
});
