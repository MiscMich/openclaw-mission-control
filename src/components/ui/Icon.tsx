"use client";

import { forwardRef, type SVGAttributes } from "react";
import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/utils";

// Size scale following 4px grid
const ICON_SIZES = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const;

export type IconSize = keyof typeof ICON_SIZES;

// Type for all available icon names from lucide-react
export type IconName = keyof typeof LucideIcons;

export interface IconProps extends Omit<SVGAttributes<SVGElement>, "ref" | "name"> {
  /** Name of the icon from lucide-react */
  name: IconName;
  /** Size preset or custom number */
  size?: IconSize | number;
  /** Additional CSS classes */
  className?: string;
  /** Color - uses currentColor by default */
  color?: string;
  /** Stroke width */
  strokeWidth?: number;
}

/**
 * Icon component wrapping lucide-react
 *
 * @example
 * <Icon name="Home" size="md" />
 * <Icon name="Settings" size="lg" />
 */
export const Icon = forwardRef<SVGSVGElement, IconProps>(
  ({ name, size = "md", className, color, strokeWidth = 2, ...props }, ref) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const IconComponent = LucideIcons[name] as any;

    if (!IconComponent) {
      console.warn(`Icon "${String(name)}" not found in lucide-react`);
      return null;
    }

    const resolvedSize = typeof size === "number" ? size : ICON_SIZES[size];

    return (
      <IconComponent
        ref={ref}
        size={resolvedSize}
        color={color}
        strokeWidth={strokeWidth}
        className={cn("flex-shrink-0", className)}
        {...props}
      />
    );
  }
);

Icon.displayName = "Icon";

// =============================================================================
// ICON MAPPING: Standard icons for OpenClaw Mission Control
// =============================================================================

/**
 * Standard icon mappings for OpenClaw Mission Control
 * Use these instead of emojis for consistent, scalable icons
 */
export const ICON_MAP = {
  // Navigation
  home: "Home",
  dashboard: "BarChart3",
  tasks: "CheckSquare",
  files: "Folder",
  settings: "Settings",
  agents: "Bot",
  menu: "Menu",

  // Actions
  add: "Plus",
  create: "Sparkles",
  search: "Search",
  filter: "Filter",
  sort: "ArrowUpDown",
  info: "Info",
  close: "X",
  check: "CheckCircle",
  edit: "Pencil",
  delete: "Trash2",
  refresh: "RefreshCw",
  send: "Send",

  // Status
  live: "Zap",
  working: "Zap",
  idle: "Moon",
  error: "AlertCircle",
  warning: "AlertTriangle",
  success: "CheckCircle",
  blocked: "Ban",

  // Data
  cost: "DollarSign",
  tokens: "Coins",
  activity: "Activity",
  chart: "BarChart2",
  heatmap: "Flame",

  // Priority
  urgent: "ArrowUp",
  high: "ArrowUpRight",
  normal: "Minus",
  low: "ArrowDown",

  // Communication
  message: "MessageSquare",
  notification: "Bell",
  comment: "MessageCircle",

  // Misc
  terminal: "Terminal",
  clock: "Clock",
  user: "User",
  robot: "Bot",
  lightning: "Zap",
  star: "Star",
  link: "Link",
  copy: "Copy",
  download: "Download",
  upload: "Upload",
  play: "Play",
  pause: "Pause",
  stop: "Square",
  keyboard: "Keyboard",

  // Arrows
  arrowLeft: "ArrowLeft",
  arrowRight: "ArrowRight",
  arrowUp: "ArrowUp",
  arrowDown: "ArrowDown",
  chevronLeft: "ChevronLeft",
  chevronRight: "ChevronRight",
  chevronUp: "ChevronUp",
  chevronDown: "ChevronDown",
  expand: "Maximize2",
  collapse: "Minimize2",
} as const;

export type MappedIconName = keyof typeof ICON_MAP;

/**
 * Convenience component using mapped icon names
 *
 * @example
 * <MappedIcon name="tasks" size="md" />
 * <MappedIcon name="settings" />
 */
export function MappedIcon({
  name,
  ...props
}: Omit<IconProps, "name"> & { name: MappedIconName }) {
  return <Icon name={ICON_MAP[name] as IconName} {...props} />;
}

// =============================================================================
// STATUS ICON HELPER
// =============================================================================

export type AgentStatus = "live" | "working" | "idle" | "error" | "blocked";

export function StatusIcon({
  status,
  ...props
}: Omit<IconProps, "name"> & { status: AgentStatus }) {
  const iconName = ICON_MAP[status] || ICON_MAP.idle;
  return <Icon name={iconName as IconName} {...props} />;
}
