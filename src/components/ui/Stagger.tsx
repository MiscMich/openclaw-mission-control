"use client";

import { forwardRef, type ReactNode } from "react";
import { motion, type Variants, type Transition } from "framer-motion";

// =============================================================================
// STAGGER CONTAINER
// =============================================================================

export interface StaggerContainerProps {
  /** Content to stagger */
  children: ReactNode;
  /** Delay between each child animation */
  staggerDelay?: number;
  /** Whether to stagger children on mount */
  animate?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** ARIA role */
  role?: string;
  /** ARIA label */
  "aria-label"?: string;
}

/**
 * Container that staggers child animations
 * Use with StaggerItem for coordinated entrance animations
 *
 * @example
 * <StaggerContainer staggerDelay={0.08}>
 *   <StaggerItem>First</StaggerItem>
 *   <StaggerItem>Second</StaggerItem>
 *   <StaggerItem>Third</StaggerItem>
 * </StaggerContainer>
 */
export const StaggerContainer = forwardRef<HTMLDivElement, StaggerContainerProps>(
  ({ children, staggerDelay = 0.05, animate = true, className, role, "aria-label": ariaLabel }, ref) => {
    return (
      <motion.div
        ref={ref}
        initial={animate ? "hidden" : false}
        animate={animate ? "show" : false}
        variants={{
          hidden: {},
          show: {
            transition: {
              staggerChildren: staggerDelay,
            },
          },
        }}
        className={className}
        role={role}
        aria-label={ariaLabel}
      >
        {children}
      </motion.div>
    );
  }
);

StaggerContainer.displayName = "StaggerContainer";

// =============================================================================
// STAGGER ITEM
// =============================================================================

export type StaggerDirection = "up" | "down" | "left" | "right" | "fade";

export interface StaggerItemProps {
  /** Content */
  children: ReactNode;
  /** Animation direction */
  direction?: StaggerDirection;
  /** Custom animation distance (px) */
  distance?: number;
  /** Additional CSS classes */
  className?: string;
  /** ARIA role */
  role?: string;
}

const getItemVariants = (direction: StaggerDirection, distance: number): Variants => {
  const offset = {
    up: { y: distance },
    down: { y: -distance },
    left: { x: distance },
    right: { x: -distance },
    fade: { y: 0, x: 0 },
  };

  return {
    hidden: {
      opacity: 0,
      ...offset[direction],
    },
    show: {
      opacity: 1,
      x: 0,
      y: 0,
    },
  };
};

const itemTransition: Transition = {
  duration: 0.3,
  ease: [0.16, 1, 0.3, 1],
};

/**
 * Individual item within a StaggerContainer
 *
 * @example
 * <StaggerItem direction="up">Content slides up</StaggerItem>
 * <StaggerItem direction="left" distance={20}>Content slides from right</StaggerItem>
 */
export const StaggerItem = forwardRef<HTMLDivElement, StaggerItemProps>(
  ({ children, direction = "up", distance = 12, className, role }, ref) => {
    return (
      <motion.div
        ref={ref}
        variants={getItemVariants(direction, distance)}
        transition={itemTransition}
        className={className}
        role={role}
      >
        {children}
      </motion.div>
    );
  }
);

StaggerItem.displayName = "StaggerItem";

// =============================================================================
// FADE IN
// =============================================================================

export interface FadeInProps {
  children: ReactNode;
  /** Delay before animation starts */
  delay?: number;
  /** Animation duration */
  duration?: number;
  /** Whether to animate */
  animate?: boolean;
  className?: string;
}

/**
 * Simple fade-in animation wrapper
 *
 * @example
 * <FadeIn delay={0.2}>Content fades in</FadeIn>
 */
export const FadeIn = forwardRef<HTMLDivElement, FadeInProps>(
  ({ children, delay = 0, duration = 0.3, animate = true, className }, ref) => {
    return (
      <motion.div
        ref={ref}
        initial={animate ? { opacity: 0 } : false}
        animate={animate ? { opacity: 1 } : false}
        transition={{ delay, duration, ease: [0.16, 1, 0.3, 1] }}
        className={className}
      >
        {children}
      </motion.div>
    );
  }
);

FadeIn.displayName = "FadeIn";

// =============================================================================
// SLIDE IN
// =============================================================================

export interface SlideInProps {
  children: ReactNode;
  /** Slide direction */
  direction?: "up" | "down" | "left" | "right";
  /** Distance to slide */
  distance?: number;
  /** Delay before animation */
  delay?: number;
  /** Animation duration */
  duration?: number;
  /** Whether to animate */
  animate?: boolean;
  className?: string;
}

/**
 * Slide-in animation wrapper
 *
 * @example
 * <SlideIn direction="left" delay={0.1}>Content slides from left</SlideIn>
 */
export const SlideIn = forwardRef<HTMLDivElement, SlideInProps>(
  (
    {
      children,
      direction = "up",
      distance = 16,
      delay = 0,
      duration = 0.3,
      animate = true,
      className,
    },
    ref
  ) => {
    const offset = {
      up: { y: distance, x: 0 },
      down: { y: -distance, x: 0 },
      left: { x: distance, y: 0 },
      right: { x: -distance, y: 0 },
    };

    return (
      <motion.div
        ref={ref}
        initial={animate ? { opacity: 0, ...offset[direction] } : false}
        animate={animate ? { opacity: 1, x: 0, y: 0 } : false}
        transition={{ delay, duration, ease: [0.16, 1, 0.3, 1] }}
        className={className}
      >
        {children}
      </motion.div>
    );
  }
);

SlideIn.displayName = "SlideIn";

// =============================================================================
// SCALE IN
// =============================================================================

export interface ScaleInProps {
  children: ReactNode;
  /** Initial scale */
  from?: number;
  /** Delay before animation */
  delay?: number;
  /** Animation duration */
  duration?: number;
  /** Whether to animate */
  animate?: boolean;
  className?: string;
}

/**
 * Scale-in animation wrapper
 *
 * @example
 * <ScaleIn from={0.9} delay={0.2}>Content scales in</ScaleIn>
 */
export const ScaleIn = forwardRef<HTMLDivElement, ScaleInProps>(
  (
    { children, from = 0.95, delay = 0, duration = 0.3, animate = true, className },
    ref
  ) => {
    return (
      <motion.div
        ref={ref}
        initial={animate ? { opacity: 0, scale: from } : false}
        animate={animate ? { opacity: 1, scale: 1 } : false}
        transition={{ delay, duration, ease: [0.16, 1, 0.3, 1] }}
        className={className}
      >
        {children}
      </motion.div>
    );
  }
);

ScaleIn.displayName = "ScaleIn";

// =============================================================================
// PRESENCE WRAPPER
// =============================================================================

export { AnimatePresence } from "framer-motion";

// Re-export for convenience
export default StaggerContainer;
