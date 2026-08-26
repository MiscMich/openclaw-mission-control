"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

// =============================================================================
// TIME AGO UTILITY
// =============================================================================

function formatRelative(from: number, now: number) {
  const diff = now - from;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  const seconds = Math.round(diff / 1000);
  if (Math.abs(seconds) < 60) return "just now";

  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, "minute");

  const hours = Math.round(diff / 3600000);
  if (Math.abs(hours) < 24) return rtf.format(-hours, "hour");

  const days = Math.round(diff / 86400000);
  if (Math.abs(days) < 7) return rtf.format(-days, "day");

  const weeks = Math.round(diff / 604800000);
  if (Math.abs(weeks) < 5) return rtf.format(-weeks, "week");

  const months = Math.round(diff / 2592000000);
  if (Math.abs(months) < 12) return rtf.format(-months, "month");

  const years = Math.round(diff / 31536000000);
  return rtf.format(-years, "year");
}

// =============================================================================
// TIME AGO COMPONENT
// =============================================================================

export interface TimeAgoProps {
  /** Timestamp (string, number, or null) */
  timestamp?: string | number | null;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Relative time display component with auto-refresh
 *
 * @example
 * <TimeAgo timestamp={task.createdAt} />
 * <TimeAgo timestamp="2024-01-15T10:30:00Z" className="text-muted" />
 */
export function TimeAgo({ timestamp, className }: TimeAgoProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const label = useMemo(() => {
    if (!timestamp) return "—";
    const value =
      typeof timestamp === "string" ? Date.parse(timestamp) : timestamp;
    if (!value || Number.isNaN(value)) return "—";
    return formatRelative(value, now);
  }, [timestamp, now]);

  return (
    <span
      data-slot="time-ago"
      className={cn("text-xs text-[var(--text-dim)]", className)}
      title={timestamp ? new Date(timestamp).toLocaleString() : undefined}
    >
      {label}
    </span>
  );
}
