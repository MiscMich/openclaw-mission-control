export const TASK_STATUS_VALUES = [
  "open",
  "inbox",
  "assigned",
  "in_progress",
  "review",
  "completed",
  "done",
  "blocked",
  "failed",
  "cancelled",
] as const;

export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];

export const ACTIVE_TASK_STATUS_VALUES = [
  "assigned",
  "in_progress",
  "review",
] as const satisfies readonly TaskStatus[];

export const COMPLETED_TASK_STATUS_VALUES = [
  "completed",
  "done",
] as const satisfies readonly TaskStatus[];

export const TASK_STATUS_PRIORITY: Record<TaskStatus, number> = {
  in_progress: 3,
  review: 2,
  assigned: 1,
  open: 0,
  inbox: 0,
  completed: 0,
  done: 0,
  blocked: 0,
  failed: 0,
  cancelled: 0,
};

const TASK_STATUS_SET = new Set<string>(TASK_STATUS_VALUES);
const ACTIVE_TASK_STATUS_SET = new Set<string>(ACTIVE_TASK_STATUS_VALUES);
const COMPLETED_TASK_STATUS_SET = new Set<string>(COMPLETED_TASK_STATUS_VALUES);

export function isTaskStatus(value: string): value is TaskStatus {
  return TASK_STATUS_SET.has(value);
}

export function isActiveTaskStatus(status: string): boolean {
  return ACTIVE_TASK_STATUS_SET.has(status);
}

export function isCompletedTaskStatus(status: string): boolean {
  return COMPLETED_TASK_STATUS_SET.has(status);
}
