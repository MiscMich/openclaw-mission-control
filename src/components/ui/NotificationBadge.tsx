"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useSound } from "@/hooks/useSound";

interface NotificationBadgeProps {
  count: number;
  /** Play sound when count increases */
  soundEnabled?: boolean;
  /** Badge size */
  size?: "sm" | "md";
  /** Additional class names */
  className?: string;
}

/**
 * Animated notification badge with sound support
 * Shows count with pop animation when updated
 */
export function NotificationBadge({
  count,
  soundEnabled = true,
  size = "sm",
  className,
}: NotificationBadgeProps) {
  const prevCount = useRef(count);
  const { playNotification } = useSound({ enabled: soundEnabled });

  // Play sound when count increases
  useEffect(() => {
    if (count > prevCount.current && soundEnabled) {
      playNotification();
    }
    prevCount.current = count;
  }, [count, soundEnabled, playNotification]);

  const sizeClasses = {
    sm: "min-w-[18px] h-[18px] text-[10px] px-1",
    md: "min-w-[22px] h-[22px] text-[11px] px-1.5",
  };

  return (
    <AnimatePresence mode="wait">
      {count > 0 && (
        <motion.span
          key={count}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 25,
          }}
          className={cn(
            "inline-flex items-center justify-center",
            "rounded-full font-semibold",
            "bg-[var(--accent-error)] text-white",
            "shadow-[0_0_8px_rgba(239,68,68,0.4)]",
            sizeClasses[size],
            className
          )}
        >
          {count > 99 ? "99+" : count}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

export default NotificationBadge;
