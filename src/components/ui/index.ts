/**
 * OpenClaw Mission Control — UI Component Library
 *
 * USAGE:
 *   import { Button, Dialog, DialogContent, ... } from "@/components/ui";
 *   import { toast } from "sonner";  // Toast notifications
 *
 * PATTERNS:
 *   - Dialogs: Use <Dialog> + <DialogContent> (not Modal)
 *   - Toasts: Use toast.success() / toast.error() from sonner
 *   - Forms: Use <Input label="..." /> with built-in labels
 *   - Buttons: Use loading prop for async states
 *
 * DO NOT USE:
 *   - useToast() hook (deleted - use sonner directly)
 *   - <Modal> component (deleted - use <Dialog>)
 *   - <ToastProvider> (deleted - <Toaster> is in layout.tsx)
 */

// =============================================================================
// CORE COMPONENTS
// =============================================================================

// Icons
export {
  Icon,
  MappedIcon,
  StatusIcon,
  ICON_MAP,
  type IconName,
  type IconSize,
  type IconProps,
  type MappedIconName,
  type AgentStatus,
} from "./Icon";

// Typography
export {
  Typography,
  Heading,
  Text,
  Label,
  Stat,
  Mono,
  type TypographyVariant,
  type TextColor,
  type TypographyProps,
} from "./Typography";

// Buttons (shadcn-compatible with CVA)
export {
  Button,
  ButtonGroup,
  buttonVariants,
  type ButtonVariant,
  type ButtonSize,
  type ButtonProps,
  type ButtonGroupProps,
} from "./Button";

// Inputs (shadcn-compatible with CVA)
export {
  Input,
  Textarea,
  Select,
  FormGroup,
  inputVariants,
  textareaVariants,
  type InputProps,
  type TextareaProps,
  type SelectProps,
  type SelectOption,
  type FormGroupProps,
} from "./Input";

// Badges (shadcn-compatible with CVA)
export {
  Badge,
  StatusBadge,
  PriorityBadge,
  CountBadge,
  badgeVariants,
  type BadgeVariant,
  type BadgeSize,
  type BadgeProps,
  type StatusType,
  type StatusBadgeProps,
  type PriorityLevel,
  type PriorityBadgeProps,
  type CountBadgeProps,
} from "./Badge";

// =============================================================================
// LAYOUT COMPONENTS
// =============================================================================

// Glass Panel
export {
  GlassPanel,
  type GlassPanelProps,
} from "./GlassPanel";

// Container & Layout
export {
  Container,
  Section,
  Stack,
  Row,
  Grid,
  type ContainerSize,
  type ContainerProps,
  type SectionProps,
  type StackProps,
  type RowProps,
  type GridProps,
} from "./Container";

// =============================================================================
// ANIMATION COMPONENTS
// =============================================================================

export {
  StaggerContainer,
  StaggerItem,
  FadeIn,
  SlideIn,
  ScaleIn,
  AnimatePresence,
  type StaggerContainerProps,
  type StaggerItemProps,
  type StaggerDirection,
  type FadeInProps,
  type SlideInProps,
  type ScaleInProps,
} from "./Stagger";

// =============================================================================
// DATA DISPLAY
// =============================================================================

// Kinetic Numbers
export {
  KineticNumber,
  type KineticNumberProps,
} from "./KineticNumber";

// Notifications
export {
  NotificationBadge,
} from "./NotificationBadge";
export {
  NotificationDropdown,
} from "./NotificationDropdown";

// =============================================================================
// STATUS & FEEDBACK
// =============================================================================

// Agent Avatar (letter-based, gradient backgrounds — NO emojis)
export {
  AgentAvatar,
  type AgentAvatarProps,
  type AvatarSize,
} from "./AgentAvatar";

// Empty States
export {
  EmptyState,
  type EmptyStateProps,
} from "./EmptyState";

// Status Indicators (legacy - prefer Badge components)
export { StatusDot } from "./StatusDot";
export { PriorityBadge as LegacyPriorityBadge } from "./PriorityBadge";
export { TimeAgo } from "./TimeAgo";

// Gateway Health
export { GatewayHealthIndicator } from "./GatewayHealthIndicator";

// Skeleton Loading States
export {
  Skeleton,
  TaskCardSkeleton,
  ActivityItemSkeleton,
  StatCardSkeleton,
  AgentRowSkeleton,
  AgentCardSkeleton,
  FormSkeleton,
  DocumentCardSkeleton,
  NotificationCardSkeleton,
} from "./Skeleton";

// =============================================================================
// COMMAND PALETTE & SHORTCUTS
// =============================================================================

export { CommandPalette } from "./CommandPalette";
export { ShortcutsHelp } from "./ShortcutsHelp";

// =============================================================================
// SHADCN/UI COMPONENTS
// =============================================================================

// Dialog
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

// Alert Dialog
export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog";

// Confirmation Dialog (AlertDialog-based)
export { ConfirmDialog, type ConfirmDialogProps } from "./ConfirmDialog";

// Dropdown Menu
export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "./dropdown-menu";

// Popover
export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
} from "./popover";

// Tabs
export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  tabsListVariants,
} from "./tabs";

// Sonner (Toast)
export { Toaster } from "./sonner";

// Tooltip
export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "./tooltip";

// =============================================================================
// SEARCH & FILTERS
// =============================================================================

export { SearchInput } from "./SearchInput";
export { PaginationControls } from "./PaginationControls";
