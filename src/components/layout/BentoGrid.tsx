"use client";

import { type ReactNode, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface BentoGridProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Number of columns at different breakpoints */
  columns?: {
    default?: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
  /** Gap between items */
  gap?: "sm" | "md" | "lg";
}

const gapClasses = {
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
};

// Static lookup maps for Tailwind grid classes
const gridColsClasses: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
  7: "grid-cols-7",
  8: "grid-cols-8",
  9: "grid-cols-9",
  10: "grid-cols-10",
  11: "grid-cols-11",
  12: "grid-cols-12",
};

const smGridColsClasses: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  5: "sm:grid-cols-5",
  6: "sm:grid-cols-6",
  7: "sm:grid-cols-7",
  8: "sm:grid-cols-8",
  9: "sm:grid-cols-9",
  10: "sm:grid-cols-10",
  11: "sm:grid-cols-11",
  12: "sm:grid-cols-12",
};

const mdGridColsClasses: Record<number, string> = {
  1: "md:grid-cols-1",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
  5: "md:grid-cols-5",
  6: "md:grid-cols-6",
  7: "md:grid-cols-7",
  8: "md:grid-cols-8",
  9: "md:grid-cols-9",
  10: "md:grid-cols-10",
  11: "md:grid-cols-11",
  12: "md:grid-cols-12",
};

const lgGridColsClasses: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
  7: "lg:grid-cols-7",
  8: "lg:grid-cols-8",
  9: "lg:grid-cols-9",
  10: "lg:grid-cols-10",
  11: "lg:grid-cols-11",
  12: "lg:grid-cols-12",
};

const xlGridColsClasses: Record<number, string> = {
  1: "xl:grid-cols-1",
  2: "xl:grid-cols-2",
  3: "xl:grid-cols-3",
  4: "xl:grid-cols-4",
  5: "xl:grid-cols-5",
  6: "xl:grid-cols-6",
  7: "xl:grid-cols-7",
  8: "xl:grid-cols-8",
  9: "xl:grid-cols-9",
  10: "xl:grid-cols-10",
  11: "xl:grid-cols-11",
  12: "xl:grid-cols-12",
};

const colSpanClasses: Record<number, string> = {
  1: "col-span-1",
  2: "col-span-2",
  3: "col-span-3",
  4: "col-span-4",
  5: "col-span-5",
  6: "col-span-6",
  7: "col-span-7",
  8: "col-span-8",
  9: "col-span-9",
  10: "col-span-10",
  11: "col-span-11",
  12: "col-span-12",
};

const smColSpanClasses: Record<number, string> = {
  1: "sm:col-span-1",
  2: "sm:col-span-2",
  3: "sm:col-span-3",
  4: "sm:col-span-4",
  5: "sm:col-span-5",
  6: "sm:col-span-6",
  7: "sm:col-span-7",
  8: "sm:col-span-8",
  9: "sm:col-span-9",
  10: "sm:col-span-10",
  11: "sm:col-span-11",
  12: "sm:col-span-12",
};

const mdColSpanClasses: Record<number, string> = {
  1: "md:col-span-1",
  2: "md:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
  5: "md:col-span-5",
  6: "md:col-span-6",
  7: "md:col-span-7",
  8: "md:col-span-8",
  9: "md:col-span-9",
  10: "md:col-span-10",
  11: "md:col-span-11",
  12: "md:col-span-12",
};

const lgColSpanClasses: Record<number, string> = {
  1: "lg:col-span-1",
  2: "lg:col-span-2",
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  5: "lg:col-span-5",
  6: "lg:col-span-6",
  7: "lg:col-span-7",
  8: "lg:col-span-8",
  9: "lg:col-span-9",
  10: "lg:col-span-10",
  11: "lg:col-span-11",
  12: "lg:col-span-12",
};

const xlColSpanClasses: Record<number, string> = {
  1: "xl:col-span-1",
  2: "xl:col-span-2",
  3: "xl:col-span-3",
  4: "xl:col-span-4",
  5: "xl:col-span-5",
  6: "xl:col-span-6",
  7: "xl:col-span-7",
  8: "xl:col-span-8",
  9: "xl:col-span-9",
  10: "xl:col-span-10",
  11: "xl:col-span-11",
  12: "xl:col-span-12",
};

/**
 * Bento Grid container for asymmetric but balanced layouts
 * Uses CSS Grid with flexible column spans
 */
export function BentoGrid({
  children,
  className,
  columns = { default: 1, md: 6, lg: 12 },
  gap = "md",
  ...props
}: BentoGridProps) {
  return (
    <div
      className={cn(
        "grid",
        "min-h-0", // Critical for flex child to respect height constraints
        gapClasses[gap],
        // Responsive columns using static class lookups
        columns.default && gridColsClasses[columns.default],
        columns.sm && smGridColsClasses[columns.sm],
        columns.md && mdGridColsClasses[columns.md],
        columns.lg && lgGridColsClasses[columns.lg],
        columns.xl && xlGridColsClasses[columns.xl],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface BentoItemProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Column span (1-12) */
  colSpan?:
    | number
    | { default?: number; sm?: number; md?: number; lg?: number; xl?: number };
  /** Row span */
  rowSpan?: number;
}

/**
 * Individual item within a BentoGrid
 * Can span multiple columns/rows
 */
export function BentoItem({
  children,
  className,
  colSpan = 1,
  rowSpan = 1,
  ...props
}: BentoItemProps) {
  const colSpanClassNames =
    typeof colSpan === "number"
      ? [colSpanClasses[colSpan] ?? colSpanClasses[1]]
      : [
          colSpan.default ? colSpanClasses[colSpan.default] : colSpanClasses[1],
          colSpan.sm ? smColSpanClasses[colSpan.sm] : null,
          colSpan.md ? mdColSpanClasses[colSpan.md] : null,
          colSpan.lg ? lgColSpanClasses[colSpan.lg] : null,
          colSpan.xl ? xlColSpanClasses[colSpan.xl] : null,
        ];

  return (
    <div
      className={cn("min-w-0", colSpanClassNames, className)}
      style={{
        gridRow: rowSpan > 1 ? `span ${rowSpan} / span ${rowSpan}` : undefined,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export default BentoGrid;
