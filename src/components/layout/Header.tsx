"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convexApi";
import {
  Button,
  MappedIcon,
  Popover,
  PopoverTrigger,
  PopoverContent,
  NotificationDropdown,
  GatewayHealthIndicator,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui";
import { toast } from "sonner";

// =============================================================================
// TYPES
// =============================================================================

interface HeaderProps {
  onNewTask: () => void;
  onCommandPalette: () => void;
  onNotificationsClick?: () => void;
  onSettingsClick?: () => void;
  /** Mobile sidebar open state */
  isMobileSidebarOpen?: boolean;
  /** Callback to toggle mobile sidebar */
  onToggleMobileSidebar?: () => void;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const Header = memo(function Header({
  onNewTask,
  onCommandPalette,
  onNotificationsClick,
  onSettingsClick,
  isMobileSidebarOpen = false,
  onToggleMobileSidebar,
}: HeaderProps) {
  const [isKilling, setIsKilling] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [stopAllDialogOpen, setStopAllDialogOpen] = useState(false);
  const undelivered = useQuery(api.notifications.listAllUndelivered, { limit: 50 });
  const unreadCount = undelivered?.length ?? 0;

  // Get recent 5 notifications for dropdown
  const recentNotifications = undelivered?.slice(0, 5) ?? [];

  // Handle stop all with proper error handling
  const handleStopAll = useCallback(async () => {
    if (isKilling) return;

    setIsKilling(true);
    setStopAllDialogOpen(false);
    const toastId = toast.loading("Stopping all running sessions...");
    try {
      const res = await fetch("/api/sessions/kill-all", { method: "POST" });
      if (!res.ok) {
        let message = res.statusText;
        try {
          const body = (await res.json()) as { error?: string };
          if (body?.error) message = body.error;
        } catch {
          // Ignore JSON parse error
        }
        throw new Error(message || "Failed to stop sessions");
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (body?.error) {
        throw new Error(body.error);
      }
      toast.success("All sessions stopped", { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error("Failed to stop sessions", {
        id: toastId,
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsKilling(false);
    }
  }, [isKilling]);

  // Keyboard shortcut for new task
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        onNewTask();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNewTask]);

  return (
    <header className="header" role="banner">
      <div className="header-inner">
        <div className="flex items-center gap-8">
          {/* Mobile Hamburger Menu Button - only visible below 900px */}
          {onToggleMobileSidebar && (
            <button
              type="button"
              onClick={onToggleMobileSidebar}
              className="mobile-menu-button"
              aria-label={isMobileSidebarOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={isMobileSidebarOpen}
              aria-controls="mobile-sidebar"
            >
              <MappedIcon name={isMobileSidebarOpen ? "close" : "menu"} size="md" />
            </button>
          )}

          {/* Gateway Health Indicator */}
          <GatewayHealthIndicator />
        </div>

        {/* Actions */}
        <div className="header-actions">
          {/* Search Button */}
          <button
            onClick={onCommandPalette}
            className="header-kbd-button hidden md:flex"
            aria-label="Open search (Keyboard shortcut: Command K)"
          >
            <MappedIcon name="search" size="sm" />
            <span>Search</span>
            <kbd className="command-kbd" aria-hidden="true">⌘K</kbd>
          </button>

          {/* Settings Gear */}
          {onSettingsClick && (
            <button
              className="header-notification-bell"
              onClick={onSettingsClick}
              aria-label="Open settings (Keyboard shortcut: Command comma)"
            >
              <MappedIcon name="settings" size="sm" />
            </button>
          )}

          {/* Notification Bell */}
          <Popover open={notificationOpen} onOpenChange={setNotificationOpen}>
            <PopoverTrigger asChild>
              <button
                className="header-notification-bell"
                aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
              >
                <MappedIcon name="notification" size="sm" />
                {unreadCount > 0 && (
                  <span className="header-notification-badge">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="p-0">
              <NotificationDropdown
                notifications={recentNotifications}
                onViewAll={() => {
                  setNotificationOpen(false);
                  onNotificationsClick?.();
                }}
              />
            </PopoverContent>
          </Popover>

          {/* Stop All Button */}
          <AlertDialog open={stopAllDialogOpen} onOpenChange={setStopAllDialogOpen}>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setStopAllDialogOpen(true)}
              disabled={isKilling}
              loading={isKilling}
              aria-label="Stop all running agent sessions"
            >
              {!isKilling && <MappedIcon name="warning" size="xs" />}
              {isKilling ? "Stopping..." : "STOP ALL"}
            </Button>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Stop All Running Sessions?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will immediately terminate all agents. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  <Button variant="secondary">Cancel</Button>
                </AlertDialogCancel>
                <AlertDialogAction>
                  <Button variant="danger" onClick={handleStopAll}>
                    Stop All
                  </Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* New Task Button */}
          <Button
            variant="primary"
            size="sm"
            mappedIcon="add"
            onClick={onNewTask}
            aria-label="Create new task (Keyboard shortcut: Command N)"
          >
            <span className="hidden sm:inline">New Task</span>
          </Button>
        </div>
      </div>
    </header>
  );
});

export default Header;
