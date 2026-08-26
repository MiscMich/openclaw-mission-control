"use client"

import * as React from "react"
import { forwardRef, type HTMLAttributes } from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Icon, type IconName, ICON_MAP, type MappedIconName } from "./Icon"

// =============================================================================
// BADGE VARIANTS (CVA Pattern)
// =============================================================================

/**
 * Shadcn-compatible Badge Variants - OpenClaw Mission Control Design System
 */
const badgeVariants = cva(
  // Base styles
  [
    "inline-flex items-center justify-center",
    "font-medium text-[11px] tracking-[0.02em]",
    "rounded-[var(--radius-full)]",
    "border",
    "whitespace-nowrap",
    "transition-colors",
    // Focus styles for interactive badges
    "focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:ring-offset-2",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        default: [
          "text-[var(--text-muted)]",
          "bg-transparent",
          "border-[var(--border-subtle)]",
        ],
        primary: [
          "text-[var(--accent-primary)]",
          "bg-[var(--accent-soft)]",
          "border-[var(--accent-strong)]",
        ],
        secondary: [
          "text-[var(--text-secondary)]",
          "bg-[var(--bg-hover)]",
          "border-[var(--border-subtle)]",
        ],
        success: [
          "text-[var(--accent-success)]",
          "bg-[var(--accent-success-soft)]",
          "border-[var(--accent-success-strong)]",
        ],
        warning: [
          "text-[var(--accent-warning)]",
          "bg-[var(--accent-warning-soft)]",
          "border-[var(--accent-warning-strong)]",
        ],
        error: [
          "text-[var(--accent-error)]",
          "bg-[var(--accent-error-soft)]",
          "border-[var(--accent-error-strong)]",
        ],
        destructive: [
          "text-[var(--accent-error)]",
          "bg-[var(--accent-error-soft)]",
          "border-[var(--accent-error-strong)]",
        ],
        info: [
          "text-[var(--accent-info)]",
          "bg-[var(--accent-info-soft)]",
          "border-[var(--accent-info-strong)]",
        ],
        outline: [
          "text-[var(--text-primary)]",
          "bg-transparent",
          "border-[var(--border-default)]",
        ],
      },
      size: {
        default: "h-6 px-2.5 gap-1.5 text-[10px]",
        sm: "h-5 px-2 gap-1 text-[9px]",
        md: "h-6 px-2.5 gap-1.5 text-[10px]",
        lg: "h-7 px-3 gap-2 text-[11px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// =============================================================================
// BADGE TYPES
// =============================================================================

export type BadgeVariant =
  | "default"
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "error"
  | "destructive"
  | "info"
  | "outline"

export type BadgeSize = "sm" | "md" | "lg" | "default"

// =============================================================================
// BADGE COMPONENT
// =============================================================================

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Show status dot */
  dot?: boolean
  /** Animate the dot */
  pulse?: boolean
  /** Left icon */
  icon?: IconName
  /** Use mapped icon */
  mappedIcon?: MappedIconName
}

const dotSizes: Record<string, string> = {
  sm: "w-1.5 h-1.5",
  md: "w-2 h-2",
  default: "w-2 h-2",
  lg: "w-2.5 h-2.5",
}

/**
 * Badge component for status indicators, labels, and counts
 *
 * @example
 * // Basic usage
 * <Badge>Default</Badge>
 * <Badge variant="primary">Primary</Badge>
 *
 * // With dot
 * <Badge variant="success" dot>Online</Badge>
 * <Badge variant="warning" dot pulse>In Progress</Badge>
 *
 * // With icon
 * <Badge variant="error" mappedIcon="error">Error</Badge>
 */
const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      variant,
      size,
      dot = false,
      pulse = false,
      icon,
      mappedIcon,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const iconName = mappedIcon ? (ICON_MAP[mappedIcon] as IconName) : icon
    const sizeKey = size || "default"
    const iconSize = sizeKey === "sm" ? 10 : sizeKey === "lg" ? 14 : 12

    return (
      <span
        ref={ref}
        data-slot="badge"
        className={cn(badgeVariants({ variant, size }), className)}
        {...props}
      >
        {/* Status dot */}
        {dot && (
          <span
            className={cn(
              "rounded-full",
              "bg-current",
              dotSizes[sizeKey],
              pulse && "animate-pulse"
            )}
          />
        )}

        {/* Icon */}
        {iconName && <Icon name={iconName} size={iconSize} />}

        {/* Content */}
        {children}
      </span>
    )
  }
)

Badge.displayName = "Badge"

// =============================================================================
// STATUS BADGE
// =============================================================================

export type StatusType =
  | "working"
  | "in_progress"
  | "idle"
  | "offline"
  | "error"
  | "success"
  | "completed"
  | "done"
  | "assigned"
  | "review"
  | "blocked"
  | "inbox"
  | "open"

const statusConfig: Record<StatusType, { variant: BadgeVariant; label: string; pulse?: boolean }> = {
  working: { variant: "primary", label: "Working", pulse: true },
  in_progress: { variant: "primary", label: "In Progress", pulse: true },
  idle: { variant: "default", label: "Idle" },
  offline: { variant: "default", label: "Offline" },
  error: { variant: "error", label: "Error" },
  success: { variant: "success", label: "Success" },
  completed: { variant: "success", label: "Completed" },
  done: { variant: "success", label: "Done" },
  assigned: { variant: "warning", label: "Assigned" },
  review: { variant: "info", label: "Review" },
  blocked: { variant: "error", label: "Blocked" },
  inbox: { variant: "default", label: "Inbox" },
  open: { variant: "default", label: "Open" },
}

export interface StatusBadgeProps extends Omit<BadgeProps, "variant" | "children"> {
  /** Status type */
  status: StatusType | string
  /** Show status dot */
  showDot?: boolean
  /** Custom label override */
  label?: string
}

/**
 * Pre-configured badge for common statuses
 *
 * @example
 * <StatusBadge status="working" showDot />
 * <StatusBadge status="completed" />
 * <StatusBadge status="blocked" showDot />
 */
function StatusBadge({
  status,
  showDot = true,
  label,
  size = "md",
  ...props
}: StatusBadgeProps) {
  const config = statusConfig[status as StatusType] || {
    variant: "default" as BadgeVariant,
    label: status.replace("_", " "),
  }

  return (
    <Badge
      variant={config.variant}
      size={size}
      dot={showDot}
      pulse={config.pulse}
      {...props}
    >
      {label || config.label}
    </Badge>
  )
}

// =============================================================================
// PRIORITY BADGE
// =============================================================================

export type PriorityLevel = "urgent" | "high" | "normal" | "low"

const priorityConfig: Record<PriorityLevel, { variant: BadgeVariant; label: string; icon: MappedIconName }> = {
  urgent: { variant: "error", label: "Urgent", icon: "urgent" },
  high: { variant: "warning", label: "High", icon: "high" },
  normal: { variant: "primary", label: "Normal", icon: "normal" },
  low: { variant: "default", label: "Low", icon: "low" },
}

export interface PriorityBadgeProps extends Omit<BadgeProps, "variant" | "children"> {
  /** Priority level */
  priority: PriorityLevel | string
  /** Show priority icon */
  showIcon?: boolean
}

/**
 * Pre-configured badge for priorities
 *
 * @example
 * <PriorityBadge priority="urgent" showIcon />
 * <PriorityBadge priority="normal" />
 */
function PriorityBadge({
  priority,
  showIcon = true,
  size = "md",
  ...props
}: PriorityBadgeProps) {
  const config = priorityConfig[priority as PriorityLevel] || priorityConfig.normal

  return (
    <Badge
      variant={config.variant}
      size={size}
      mappedIcon={showIcon ? config.icon : undefined}
      {...props}
    >
      {config.label}
    </Badge>
  )
}

// =============================================================================
// COUNT BADGE
// =============================================================================

export interface CountBadgeProps extends Omit<BadgeProps, "children"> {
  /** Count value */
  count: number
  /** Max before showing "+" */
  max?: number
  /** Show zero */
  showZero?: boolean
}

/**
 * Badge for displaying counts (notifications, items, etc.)
 *
 * @example
 * <CountBadge count={5} />
 * <CountBadge count={150} max={99} />
 */
function CountBadge({
  count,
  max = 99,
  showZero = false,
  variant = "primary",
  size = "sm",
  ...props
}: CountBadgeProps) {
  if (count === 0 && !showZero) return null

  const display = count > max ? `${max}+` : count.toString()

  return (
    <Badge variant={variant} size={size} {...props}>
      {display}
    </Badge>
  )
}

export { Badge, StatusBadge, PriorityBadge, CountBadge, badgeVariants }
export default Badge
