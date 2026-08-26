"use client";

import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

// =============================================================================
// PRIORITY BADGE VARIANTS (CVA Pattern)
// =============================================================================

/**
 * Shadcn-compatible Priority Badge Variants - OpenClaw Mission Control Design System
 */
const priorityBadgeVariants = cva(
  // Base styles
  [
    "inline-flex items-center gap-1.5",
    "px-2 py-0.5",
    "text-[10px] font-semibold uppercase tracking-wider",
    "rounded-full",
    "border",
  ],
  {
    variants: {
      priority: {
        urgent: [
          "text-[var(--accent-error)]",
          "bg-[var(--accent-error-soft)]",
          "border-[var(--accent-error-strong)]",
        ],
        high: [
          "text-[var(--accent-warning)]",
          "bg-[var(--accent-warning-soft)]",
          "border-[var(--accent-warning-strong)]",
        ],
        normal: [
          "text-[var(--accent-primary)]",
          "bg-[var(--accent-soft)]",
          "border-[var(--accent-strong)]",
        ],
        low: [
          "text-[var(--text-muted)]",
          "bg-transparent",
          "border-[var(--border-subtle)]",
        ],
      },
    },
    defaultVariants: {
      priority: "normal",
    },
  }
);

// =============================================================================
// PRIORITY BADGE TYPES
// =============================================================================

const PRIORITY_ICONS: Record<string, string> = {
  urgent: "●",
  high: "●",
  normal: "●",
  low: "○",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};

export type PriorityLevel = "urgent" | "high" | "normal" | "low";

export interface PriorityBadgeProps {
  /** Priority level */
  priority?: PriorityLevel | string;
  /** Show priority icon */
  showIcon?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Priority badge component for displaying task priorities
 *
 * @example
 * <PriorityBadge priority="urgent" />
 * <PriorityBadge priority="high" showIcon={false} />
 */
export function PriorityBadge({
  priority = "normal",
  showIcon = true,
  className,
}: PriorityBadgeProps) {
  // Validate and normalize priority to a known value
  const validPriorities: PriorityLevel[] = ["urgent", "high", "normal", "low"];
  const normalizedPriority: PriorityLevel = validPriorities.includes(priority as PriorityLevel)
    ? (priority as PriorityLevel)
    : "normal";

  const icon = PRIORITY_ICONS[normalizedPriority];
  const label = PRIORITY_LABELS[normalizedPriority];

  return (
    <span
      data-slot="priority-badge"
      className={cn(priorityBadgeVariants({ priority: normalizedPriority }), className)}
      aria-label={label}
    >
      {showIcon && <span className="text-[10px]">{icon}</span>}
      {label}
    </span>
  );
}

export { priorityBadgeVariants };
