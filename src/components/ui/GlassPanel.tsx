"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Use stronger blur and opacity */
  variant?: "default" | "strong";
  /** Add hover border glow effect */
  hoverable?: boolean;
  /** Padding preset */
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingClasses = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

/**
 * Glassmorphism container component
 * Provides backdrop blur, subtle border, and shadow effects
 */
export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  (
    {
      children,
      className,
      variant = "default",
      hoverable = false,
      padding = "md",
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          // Base styles — Geist: solid backgrounds, clean borders
          "rounded-[var(--radius-lg)] border border-[var(--border-subtle)]",
          "transition-[border-color] duration-[var(--duration-fast)]",
          // Variant styles (solid, no blur)
          variant === "default" && "bg-[var(--bg-elevated)]",
          variant === "strong" && "bg-[var(--bg-base)]",
          // Hover effect
          hoverable && "hover:border-[var(--border-default)]",
          // Padding
          paddingClasses[padding],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

GlassPanel.displayName = "GlassPanel";

export default GlassPanel;
