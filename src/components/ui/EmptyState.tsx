"use client";

import { memo, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * EmptyState — Reusable empty state component
 *
 * OpenClaw Mission Control design system:
 * - Text-only (no illustrations)
 * - Centered content
 * - Prominent CTA button
 * - 8px spacing scale
 */

export interface EmptyStateProps {
  /** Main heading */
  title: string;
  /** Description text */
  description?: string;
  /** Optional action button/content */
  action?: ReactNode;
  /** Additional CSS classes */
  className?: string;
}

export const EmptyState = memo(function EmptyState({
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "empty-state",
        "flex flex-col items-center justify-center",
        "text-center",
        "px-8 py-16",
        "max-w-[400px]",
        "mx-auto",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <h3
        className="text-base font-semibold mb-2"
        style={{ color: "var(--text-muted)" }}
      >
        {title}
      </h3>
      {description && (
        <p
          className="text-sm mb-6"
          style={{ color: "var(--text-dim)" }}
        >
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
});

export default EmptyState;
