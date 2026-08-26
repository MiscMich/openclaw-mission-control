"use client";

import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

// =============================================================================
// STATUS DOT VARIANTS (CVA Pattern)
// =============================================================================

/**
 * Shadcn-compatible Status Dot Variants - OpenClaw Mission Control Design System
 */
const statusDotVariants = cva(
  // Base styles
  [
    "w-2 h-2 rounded-full",
    "flex-shrink-0",
  ],
  {
    variants: {
      status: {
        working: "bg-[var(--accent-primary)]",
        in_progress: "bg-[var(--accent-primary)]",
        idle: "bg-[var(--text-dim)]",
        inbox: "bg-[var(--text-dim)]",
        open: "bg-[var(--text-dim)]",
        assigned: "bg-[var(--accent-warning)]",
        review: "bg-[var(--accent-warning)]",
        blocked: "bg-[var(--accent-error)]",
        offline: "bg-[var(--text-dim)] opacity-50",
        error: "bg-[var(--accent-error)]",
        completed: "bg-[var(--accent-success)]",
        done: "bg-[var(--accent-success)]",
      },
      pulse: {
        true: "status-dot-pulse",
        false: "",
      },
    },
    defaultVariants: {
      status: "idle",
      pulse: false,
    },
  }
);

// =============================================================================
// STATUS DOT TYPES
// =============================================================================

const STATUS_LABELS: Record<string, string> = {
  working: "Working",
  in_progress: "In Progress",
  idle: "Idle",
  inbox: "Inbox",
  open: "Open",
  assigned: "Assigned",
  review: "Review",
  blocked: "Blocked",
  offline: "Offline",
  error: "Error",
  completed: "Completed",
  done: "Done",
};

export type StatusType =
  | "working"
  | "in_progress"
  | "idle"
  | "inbox"
  | "open"
  | "assigned"
  | "review"
  | "blocked"
  | "offline"
  | "error"
  | "completed"
  | "done";

export interface StatusDotProps {
  /** Status type */
  status?: StatusType | string;
  /** Animate the dot */
  pulse?: boolean;
  /** Show status label */
  showLabel?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Status dot indicator component
 *
 * @example
 * <StatusDot status="working" /> // Automatically pulses for "working" status
 * <StatusDot status="completed" showLabel />
 * <StatusDot status="idle" pulse /> // Force pulse for any status
 */
export function StatusDot({
  status = "idle",
  pulse,
  showLabel = false,
  className,
}: StatusDotProps) {
  // Validate and normalize status to a known value
  const normalizedStatus: StatusType = (status && status in STATUS_LABELS)
    ? (status as StatusType)
    : "idle";
  const label = STATUS_LABELS[normalizedStatus];

  // Auto-enable pulse for working/in_progress status, unless explicitly overridden
  const shouldPulse = pulse ?? (normalizedStatus === "working" || normalizedStatus === "in_progress");

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span
        data-slot="status-dot"
        className={statusDotVariants({ status: normalizedStatus, pulse: shouldPulse })}
        aria-label={label}
        role="status"
      />
      {showLabel && (
        <span className="text-xs font-medium text-[var(--text-muted)]">
          {label}
        </span>
      )}
    </div>
  );
}

export { statusDotVariants };
