"use client"

import * as React from "react"
import { forwardRef, type ButtonHTMLAttributes } from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Icon, type IconName, ICON_MAP, type MappedIconName } from "./Icon"

// =============================================================================
// BUTTON VARIANTS (CVA Pattern)
// =============================================================================

/**
 * Shadcn-compatible Button Variants - OpenClaw Mission Control Design System
 *
 * Uses CSS variables from globals.css for theming:
 * - --accent-primary, --accent-hover, --glow
 * - --bg-hover, --border-subtle, --border-hover
 * - --text-primary, --text-secondary, --accent-error
 */
const buttonVariants = cva(
  // Base styles — Geist: clean, no lift, snappy transitions
  [
    "inline-flex items-center justify-center gap-2",
    "font-medium text-[13px]",
    "rounded-[var(--radius-sm)]",
    "border",
    "whitespace-nowrap",
    "transition-colors duration-[var(--duration-fast)]",
    "cursor-pointer select-none",
    // Focus ring
    "focus-visible:outline-none",
    "focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]",
    "focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]",
    // Disabled
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
    // Active press
    "active:opacity-80 active:duration-[50ms]",
    // SVG handling
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        // Primary/default — Geist: white bg, black text
        default: [
          "bg-[var(--text-primary)] text-[var(--bg-void)]",
          "border-transparent",
          "hover:bg-white",
        ],
        primary: [
          "bg-[var(--text-primary)] text-[var(--bg-void)]",
          "border-transparent",
          "hover:bg-white",
        ],
        // Secondary — Subtle border
        secondary: [
          "bg-transparent text-[var(--text-primary)]",
          "border-[var(--border-default)]",
          "hover:bg-[var(--bg-hover)]",
          "hover:border-[var(--border-hover)]",
        ],
        // Outline — Just border
        outline: [
          "bg-transparent text-[var(--text-primary)]",
          "border-[var(--border-subtle)]",
          "hover:bg-[var(--bg-hover)]",
          "hover:border-[var(--border-default)]",
        ],
        // Ghost — Minimal
        ghost: [
          "bg-transparent text-[var(--text-muted)]",
          "border-transparent",
          "hover:text-[var(--text-primary)]",
          "hover:bg-[var(--bg-hover)]",
        ],
        // Destructive/Danger — Red
        destructive: [
          "bg-[var(--accent-error-soft)] text-[var(--accent-error)]",
          "border-[rgba(229,72,77,0.2)]",
          "hover:bg-[rgba(229,72,77,0.15)]",
          "hover:border-[rgba(229,72,77,0.35)]",
        ],
        danger: [
          "bg-[var(--accent-error-soft)] text-[var(--accent-error)]",
          "border-[rgba(229,72,77,0.2)]",
          "hover:bg-[rgba(229,72,77,0.15)]",
          "hover:border-[rgba(229,72,77,0.35)]",
        ],
        // Success — Green
        success: [
          "bg-[var(--accent-success-soft)] text-[var(--accent-success)]",
          "border-[rgba(70,167,88,0.2)]",
          "hover:bg-[rgba(70,167,88,0.15)]",
          "hover:border-[rgba(70,167,88,0.35)]",
        ],
        // Link — Text only
        link: [
          "bg-transparent text-[var(--accent-primary)]",
          "border-transparent",
          "underline-offset-4 hover:underline",
        ],
      },
      size: {
        default: "h-9 px-3 py-2 text-[13px] max-[768px]:min-h-[44px]",
        sm: "h-7 px-2.5 text-[12px] max-[768px]:min-h-[44px]",
        md: "h-9 px-3 py-2 text-[13px] max-[768px]:min-h-[44px]",
        lg: "h-11 px-5 text-[14px]",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// =============================================================================
// BUTTON TYPES
// =============================================================================

// Legacy type exports for backwards compatibility
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "success"
  | "default"
  | "destructive"
  | "outline"
  | "link"

export type ButtonSize = "sm" | "md" | "lg" | "default" | "icon"

// =============================================================================
// BUTTON COMPONENT
// =============================================================================

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Use Slot for composition */
  asChild?: boolean
  /** Icon to show (from @hugeicons/react) */
  icon?: IconName
  /** Use mapped icon name instead of full icon name */
  mappedIcon?: MappedIconName
  /** Icon position */
  iconPosition?: "left" | "right"
  /** Loading state */
  loading?: boolean
  /** Full width button */
  fullWidth?: boolean
}

// Icon sizes per button size
const iconSizes: Record<string, "xs" | "sm" | "md"> = {
  sm: "xs",
  md: "sm",
  default: "sm",
  lg: "md",
  icon: "sm",
}

// Spinner sizes in pixels
const spinnerSizes: Record<string, number> = {
  sm: 12,
  md: 16,
  default: 16,
  lg: 20,
  icon: 16,
}

function LoadingSpinner({ size }: { size: number }) {
  return (
    <span
      className="animate-spin inline-block rounded-full border-2 border-current border-t-transparent"
      style={{
        width: size,
        height: size,
        borderWidth: size > 16 ? 2 : 1.5,
      }}
      aria-hidden="true"
    />
  )
}

/**
 * Button component following the shadcn pattern with design system theming
 *
 * @example
 * // Shadcn style
 * <Button variant="default">Create Task</Button>
 * <Button variant="destructive" size="sm">Delete</Button>
 *
 * // With icons (custom extension)
 * <Button variant="secondary" mappedIcon="settings">Settings</Button>
 * <Button variant="danger" mappedIcon="delete" loading>Delete</Button>
 *
 * // As child (composition)
 * <Button asChild>
 *   <Link href="/dashboard">Go to Dashboard</Link>
 * </Button>
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      icon,
      mappedIcon,
      iconPosition = "left",
      loading = false,
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button"
    const isDisabled = disabled || loading
    const sizeKey = size || "default"

    // Resolve icon name
    const iconName = mappedIcon ? (ICON_MAP[mappedIcon] as IconName) : icon

    const spinnerSize = spinnerSizes[sizeKey]

    // For asChild pattern, don't render icons
    if (asChild) {
      return (
        <Comp
          ref={ref}
          data-slot="button"
          className={cn(
            buttonVariants({ variant, size, className }),
            fullWidth && "w-full"
          )}
          disabled={isDisabled}
          {...props}
        >
          {children}
        </Comp>
      )
    }

    return (
      <button
        ref={ref}
        type="button"
        data-slot="button"
        disabled={isDisabled}
        className={cn(
          buttonVariants({ variant, size, className }),
          fullWidth && "w-full"
        )}
        {...props}
      >
        {/* Left icon or loading spinner */}
        {loading && iconPosition === "left" && <LoadingSpinner size={spinnerSize} />}
        {!loading && iconName && iconPosition === "left" && (
          <Icon name={iconName} size={iconSizes[sizeKey]} />
        )}

        {/* Button text */}
        {children}

        {/* Right icon or loading spinner */}
        {loading && iconPosition === "right" && <LoadingSpinner size={spinnerSize} />}
        {!loading && iconName && iconPosition === "right" && (
          <Icon name={iconName} size={iconSizes[sizeKey]} />
        )}
      </button>
    )
  }
)

Button.displayName = "Button"

// =============================================================================
// BUTTON GROUP
// =============================================================================

export interface ButtonGroupProps {
  children: React.ReactNode
  /** Stack vertically on mobile */
  responsive?: boolean
  /** Gap between buttons */
  gap?: "sm" | "md" | "lg"
  className?: string
}

const gapStyles = {
  sm: "gap-2",
  md: "gap-3",
  lg: "gap-4",
}

/**
 * Button group for related actions
 *
 * @example
 * <ButtonGroup>
 *   <Button variant="secondary">Cancel</Button>
 *   <Button variant="primary">Save</Button>
 * </ButtonGroup>
 */
function ButtonGroup({
  children,
  responsive = false,
  gap = "md",
  className,
}: ButtonGroupProps) {
  return (
    <div
      className={cn(
        "flex items-center",
        gapStyles[gap],
        responsive && "flex-col sm:flex-row",
        className
      )}
    >
      {children}
    </div>
  )
}

export { Button, ButtonGroup, buttonVariants }
export default Button
