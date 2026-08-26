"use client";

import { forwardRef, type ElementType } from "react";
import { cn } from "@/lib/utils";

// =============================================================================
// TYPOGRAPHY VARIANTS
// =============================================================================

/**
 * Typography scale following the design system
 * - Tight letter-spacing on headings (-5% to -1%)
 * - Tabular nums for data
 * - Geist font family
 */
export type TypographyVariant =
  | "hero"   // 48px, -5% tracking — Big impact numbers
  | "h1"     // 32px, -4% tracking — Page titles
  | "h2"     // 24px, -3% tracking — Section headers
  | "h3"     // 20px, -2% tracking — Card titles
  | "h4"     // 16px, -1% tracking — Subsections
  | "body"   // 14px — Default text
  | "ui"     // 14px, medium weight — Nav/buttons
  | "small"  // 12px — Captions
  | "tiny"   // 10px — Timestamps, badges
  | "label"  // 10px, uppercase — Section labels
  | "stat"   // 28px, -4% tracking — Stat values
  | "mono";  // 13px, monospace — Code/IDs

// CSS class mapping for variants
const variantClasses: Record<TypographyVariant, string> = {
  hero: "text-hero",
  h1: "text-h1",
  h2: "text-h2",
  h3: "text-h3",
  h4: "text-h4",
  body: "text-body",
  ui: "text-ui",
  small: "text-small",
  tiny: "text-tiny",
  label: "text-label",
  stat: "text-stat",
  mono: "text-mono",
};

// Default HTML tags for semantic correctness
const defaultTags: Record<TypographyVariant, ElementType> = {
  hero: "h1",
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  body: "p",
  ui: "span",
  small: "span",
  tiny: "span",
  label: "span",
  stat: "span",
  mono: "code",
};

// =============================================================================
// COLOR VARIANTS
// =============================================================================

export type TextColor =
  | "default"    // --text-primary
  | "secondary"  // --text-secondary
  | "muted"      // --text-muted
  | "dim"        // --text-dim
  | "accent"     // --accent-primary
  | "success"    // --accent-success
  | "warning"    // --accent-warning
  | "error"      // --accent-error
  | "inherit";   // inherit from parent

const colorClasses: Record<TextColor, string> = {
  default: "text-[var(--text-primary)]",
  secondary: "text-[var(--text-secondary)]",
  muted: "text-[var(--text-muted)]",
  dim: "text-[var(--text-dim)]",
  accent: "text-[var(--accent-primary)]",
  success: "text-[var(--accent-success)]",
  warning: "text-[var(--accent-warning)]",
  error: "text-[var(--accent-error)]",
  inherit: "",
};

// =============================================================================
// TYPOGRAPHY COMPONENT
// =============================================================================

export interface TypographyProps {
  /** Typography variant determining size and weight */
  variant?: TypographyVariant;
  /** HTML element to render as */
  as?: ElementType;
  /** Text color */
  color?: TextColor;
  /** Center align text */
  center?: boolean;
  /** Truncate with ellipsis */
  truncate?: boolean;
  /** Max lines before truncating (2 or 3) */
  clamp?: 2 | 3;
  /** Use tabular numbers for data */
  tabular?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Content */
  children: React.ReactNode;
}

/**
 * Typography component implementing the design system text scale
 *
 * @example
 * <Typography variant="h1">Page Title</Typography>
 * <Typography variant="body" color="muted">Description text</Typography>
 * <Typography variant="stat" tabular>$269.42</Typography>
 * <Typography variant="label">SECTION LABEL</Typography>
 */
export const Typography = forwardRef<HTMLElement, TypographyProps>(
  (
    {
      variant = "body",
      as,
      color = "default",
      center = false,
      truncate = false,
      clamp,
      tabular = false,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const Component = as || defaultTags[variant];

    return (
      <Component
        ref={ref}
        className={cn(
          variantClasses[variant],
          colorClasses[color],
          center && "text-center",
          truncate && "truncate",
          clamp === 2 && "truncate-2",
          clamp === 3 && "truncate-3",
          tabular && "tabular-nums",
          className
        )}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

Typography.displayName = "Typography";

// =============================================================================
// CONVENIENCE COMPONENTS
// =============================================================================

interface HeadingProps extends Omit<TypographyProps, "variant"> {
  level?: 1 | 2 | 3 | 4;
}

/**
 * Semantic heading component
 *
 * @example
 * <Heading level={1}>Page Title</Heading>
 * <Heading level={2} color="muted">Section</Heading>
 */
export function Heading({ level = 1, ...props }: HeadingProps) {
  const variants: Record<number, TypographyVariant> = {
    1: "h1",
    2: "h2",
    3: "h3",
    4: "h4",
  };
  return <Typography variant={variants[level]} {...props} />;
}

/**
 * Body text component
 */
export function Text({
  size = "default",
  ...props
}: Omit<TypographyProps, "variant"> & { size?: "default" | "small" | "tiny" }) {
  const variants: Record<string, TypographyVariant> = {
    default: "body",
    small: "small",
    tiny: "tiny",
  };
  return <Typography variant={variants[size]} {...props} />;
}

/**
 * Label text component (uppercase, tracking)
 */
export function Label(props: Omit<TypographyProps, "variant">) {
  return <Typography variant="label" {...props} />;
}

/**
 * Stat value component (large, tabular)
 */
export function Stat({
  value,
  prefix,
  suffix,
  color = "default",
  ...props
}: Omit<TypographyProps, "variant" | "children"> & {
  value: number | string;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <Typography variant="stat" color={color} tabular {...props}>
      {prefix}
      {value}
      {suffix}
    </Typography>
  );
}

/**
 * Monospace text component (code, IDs)
 */
export function Mono(props: Omit<TypographyProps, "variant">) {
  return <Typography variant="mono" {...props} />;
}

export default Typography;
