"use client";

import { useEffect, useSyncExternalStore } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

export interface KineticNumberProps {
  /** The target value to animate to */
  value: number;
  /** Prefix before the number (e.g., "$") */
  prefix?: string;
  /** Suffix after the number (e.g., "%") */
  suffix?: string;
  /** Number of decimal places */
  decimals?: number;
  /** Animation duration in seconds */
  duration?: number;
  /** Additional class names */
  className?: string;
  /** Format number with thousand separators */
  formatThousands?: boolean;
}

/**
 * Animated number display with smooth counting animation
 * Uses framer-motion spring physics for natural motion
 */
export function KineticNumber({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 1,
  className,
  formatThousands = true,
}: KineticNumberProps) {
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // Spring animation for smooth counting
  const spring = useSpring(value, {
    stiffness: 100,
    damping: 30,
    duration: duration * 1000,
  });

  // Transform spring value to display value
  const display = useTransform(spring, (current) => {
    const rounded = decimals > 0 ? current.toFixed(decimals) : Math.round(current);

    if (formatThousands) {
      const parts = String(rounded).split(".");
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return parts.join(".");
    }

    return String(rounded);
  });

  // Update spring target when value changes
  useEffect(() => {
    if (isClient) {
      spring.set(value);
    }
  }, [value, spring, isClient]);

  // SSR fallback
  if (!isClient) {
    const formatted = formatThousands
      ? value.toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : decimals > 0
      ? value.toFixed(decimals)
      : String(Math.round(value));

    return (
      <span className={cn("tabular-nums", className)}>
        {prefix}
        {formatted}
        {suffix}
      </span>
    );
  }

  return (
    <span className={cn("tabular-nums", className)}>
      {prefix}
      <motion.span>{display}</motion.span>
      {suffix}
    </span>
  );
}

export default KineticNumber;
