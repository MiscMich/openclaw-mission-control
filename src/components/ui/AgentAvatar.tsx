"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";

/**
 * AgentAvatar — Letter-based avatars with radial gradient backgrounds
 *
 * OpenClaw Mission Control design system:
 * - Each agent gets a deterministic radial gradient
 * - Letter-based initials (1-2 characters)
 * - Rounded corners (not circles)
 * - Optional status dot overlay
 * - No emojis, ever
 */

const GRADIENTS: Array<[string, string]> = [
  ["#8B5CF6", "#6366F1"],
  ["#0EA5E9", "#2563EB"],
  ["#10B981", "#047857"],
  ["#F59E0B", "#B45309"],
  ["#EC4899", "#BE185D"],
  ["#14B8A6", "#0F766E"],
];

function stableGradient(key: string): [string, string] {
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

// Size variants (box size + font size)
const SIZES = {
  sm: { box: 24, font: 10 },  // 24px
  md: { box: 32, font: 13 },  // 32px
  lg: { box: 48, font: 18 },  // 48px
  xl: { box: 64, font: 24 },  // 64px
} as const;

export type AvatarSize = keyof typeof SIZES;

export type AgentStatus = "idle" | "working" | "error" | "offline";

export interface AgentAvatarProps {
  /** Stable agent identifier. */
  agentId: string;
  /** Agent display name (used for fallback letter if agentId not in AGENT_LETTERS) */
  name?: string;
  /** Avatar size variant */
  size?: AvatarSize;
  /** Optional status indicator (shows colored dot in bottom-right) */
  status?: AgentStatus;
  /** Additional CSS classes */
  className?: string;
}

export const AgentAvatar = memo(function AgentAvatar({
  agentId,
  name,
  size = "md",
  status,
  className,
}: AgentAvatarProps) {
  const key = agentId.toLowerCase();
  const [center, outer] = stableGradient(key);
  const letter = (name?.[0] ?? agentId[0] ?? "?").toUpperCase();
  const { box, font } = SIZES[size];

  // Status dot colors
  const statusColors: Record<AgentStatus, string> = {
    idle: "#6B7280",       // gray
    working: "#8B5CF6",    // purple (accent)
    error: "#EF4444",      // red
    offline: "#4B5563",    // gray-dark
  };

  return (
    <div
      className={cn("relative flex-shrink-0", className)}
      style={{ width: box, height: box }}
      role="img"
      aria-label={`${name || agentId} avatar`}
    >
      {/* Main avatar with radial gradient */}
      <div
        className="flex items-center justify-center w-full h-full rounded-md"
        style={{
          background: `radial-gradient(circle at center, ${center}, ${outer})`,
          fontSize: font,
          fontWeight: 600,
          color: "#fff",
          letterSpacing: letter.length > 1 ? "-0.02em" : "0",
          lineHeight: 1,
          userSelect: "none",
        }}
      >
        {letter}
      </div>

      {/* Optional status dot (bottom-right overlay) */}
      {status && (
        <div
          className="absolute bottom-0 right-0 rounded-full border-2 border-[var(--bg-base)]"
          style={{
            width: size === "sm" ? 8 : size === "md" ? 10 : size === "lg" ? 12 : 14,
            height: size === "sm" ? 8 : size === "md" ? 10 : size === "lg" ? 12 : 14,
            backgroundColor: statusColors[status],
            boxShadow: status === "working" ? `0 0 0 2px ${statusColors[status]}40` : undefined,
          }}
          aria-label={`Status: ${status}`}
        />
      )}
    </div>
  );
});

export default AgentAvatar;
