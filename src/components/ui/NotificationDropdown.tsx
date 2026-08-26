import { memo, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@/lib/convexApi";
import { TimeAgo, MappedIcon } from "@/components/ui";
import { motion } from "framer-motion";

interface Notification {
  id: string;
  agentId: string;
  content: string;
  createdAt: number;
  delivered: boolean;
  taskId?: string;
  commentId?: string;
}

interface NotificationDropdownProps {
  notifications: Notification[];
  onViewAll: () => void;
}

export const NotificationDropdown = memo(function NotificationDropdown({
  notifications,
  onViewAll,
}: NotificationDropdownProps) {
  const markDelivered = useMutation(api.notifications.markDelivered);

  const handleNotificationClick = useCallback(
    async (notificationId: string) => {
      try {
        await markDelivered({ id: notificationId });
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
      }
    },
    [markDelivered]
  );

  if (notifications.length === 0) {
    return (
      <div className="notification-dropdown">
        <div className="notification-dropdown-header">
          <h3 className="notification-dropdown-title">Notifications</h3>
        </div>
        <div className="notification-empty-state">
          <MappedIcon name="notification" size="lg" className="opacity-40" />
          <p className="text-sm text-[var(--text-muted)]">No new notifications</p>
        </div>
      </div>
    );
  }

  return (
    <div className="notification-dropdown">
      <div className="notification-dropdown-header">
        <h3 className="notification-dropdown-title">Notifications</h3>
        <span className="text-xs text-[var(--text-dim)]">
          {notifications.length} unread
        </span>
      </div>

      <div className="notification-dropdown-list">
        {notifications.map((notification, index) => (
          <motion.button
            key={notification.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.03 }}
            className="notification-dropdown-item"
            onClick={() => {
              handleNotificationClick(notification.id);
              // Optionally navigate or perform other actions
            }}
          >
            <div className="notification-dropdown-icon">
              <MappedIcon
                name="notification"
                size="sm"
              />
            </div>
            <div className="notification-dropdown-content">
              <p className="notification-dropdown-message">{notification.content}</p>
              <span className="notification-dropdown-time">
                <TimeAgo timestamp={notification.createdAt} />
              </span>
            </div>
          </motion.button>
        ))}
      </div>

      <div className="notification-dropdown-footer">
        <button
          onClick={onViewAll}
          className="notification-dropdown-view-all"
        >
          View All Notifications
          <MappedIcon name="arrowRight" size="sm" />
        </button>
      </div>
    </div>
  );
});
