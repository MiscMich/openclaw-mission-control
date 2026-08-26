"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// =============================================================================
// CONTAINER VARIANTS (CVA Pattern)
// =============================================================================

/**
 * Shadcn-compatible Container Variants - OpenClaw Mission Control Design System
 */
const containerVariants = cva(
  // Base styles (none for container - it's just a wrapper)
  "",
  {
    variants: {
      size: {
        sm: "max-w-2xl",    // 672px
        md: "max-w-4xl",    // 896px
        lg: "max-w-5xl",    // 1024px
        xl: "max-w-6xl",    // 1152px
        "2xl": "max-w-7xl", // 1280px
        full: "max-w-none",
      },
      center: {
        true: "mx-auto",
        false: "",
      },
      padding: {
        true: "px-4 md:px-6 lg:px-8",
        false: "",
      },
    },
    defaultVariants: {
      size: "xl",
      center: true,
      padding: true,
    },
  }
);

// =============================================================================
// CONTAINER TYPES
// =============================================================================

export type ContainerSize = "sm" | "md" | "lg" | "xl" | "2xl" | "full";

export interface ContainerProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof containerVariants> {
  children: ReactNode;
}

/**
 * Responsive container with max-width constraints
 *
 * @example
 * <Container size="xl" padding>
 *   <h1>Page content</h1>
 * </Container>
 */
export const Container = forwardRef<HTMLDivElement, ContainerProps>(
  (
    { size, center, padding, className, children, ...props },
    ref
  ) => {
    return (
      <div
        ref={ref}
        data-slot="container"
        className={cn(containerVariants({ size, center, padding }), className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Container.displayName = "Container";

// =============================================================================
// SECTION COMPONENT
// =============================================================================

export interface SectionProps extends HTMLAttributes<HTMLElement> {
  /** Section spacing */
  spacing?: "sm" | "md" | "lg" | "xl";
  /** HTML tag to render */
  as?: "section" | "div" | "article" | "main";
  /** Additional CSS classes */
  className?: string;
  children: ReactNode;
}

const spacingStyles = {
  sm: "py-6",
  md: "py-8 md:py-12",
  lg: "py-12 md:py-16",
  xl: "py-16 md:py-24",
};

/**
 * Section wrapper with vertical spacing
 *
 * @example
 * <Section spacing="lg">
 *   <Container>Section content</Container>
 * </Section>
 */
export const Section = forwardRef<HTMLElement, SectionProps>(
  ({ spacing = "md", as: Tag = "section", className, children, ...props }, ref) => {
    return (
      <Tag
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ref={ref as any}
        className={cn(spacingStyles[spacing], className)}
        {...props}
      >
        {children}
      </Tag>
    );
  }
);

Section.displayName = "Section";

// =============================================================================
// STACK COMPONENT (Vertical spacing)
// =============================================================================

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  /** Gap between items */
  gap?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Alignment */
  align?: "start" | "center" | "end" | "stretch";
  /** Additional CSS classes */
  className?: string;
  children: ReactNode;
}

const stackGapStyles = {
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
};

const stackAlignStyles = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};

/**
 * Vertical stack with consistent spacing
 *
 * @example
 * <Stack gap="md">
 *   <div>Item 1</div>
 *   <div>Item 2</div>
 * </Stack>
 */
export const Stack = forwardRef<HTMLDivElement, StackProps>(
  ({ gap = "md", align = "stretch", className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col",
          stackGapStyles[gap],
          stackAlignStyles[align],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Stack.displayName = "Stack";

// =============================================================================
// ROW COMPONENT (Horizontal spacing)
// =============================================================================

export interface RowProps extends HTMLAttributes<HTMLDivElement> {
  /** Gap between items */
  gap?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Horizontal alignment */
  justify?: "start" | "center" | "end" | "between" | "around";
  /** Vertical alignment */
  align?: "start" | "center" | "end" | "stretch" | "baseline";
  /** Wrap items */
  wrap?: boolean;
  /** Additional CSS classes */
  className?: string;
  children: ReactNode;
}

const rowJustifyStyles = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
  around: "justify-around",
};

const rowAlignStyles = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
  baseline: "items-baseline",
};

/**
 * Horizontal row with consistent spacing
 *
 * @example
 * <Row gap="sm" justify="between" align="center">
 *   <span>Left</span>
 *   <span>Right</span>
 * </Row>
 */
export const Row = forwardRef<HTMLDivElement, RowProps>(
  (
    {
      gap = "md",
      justify = "start",
      align = "center",
      wrap = false,
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex",
          stackGapStyles[gap],
          rowJustifyStyles[justify],
          rowAlignStyles[align],
          wrap && "flex-wrap",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Row.displayName = "Row";

// =============================================================================
// GRID COMPONENT
// =============================================================================

export interface GridProps extends HTMLAttributes<HTMLDivElement> {
  /** Number of columns */
  columns?: 1 | 2 | 3 | 4 | 6 | 12;
  /** Responsive columns */
  responsive?: {
    sm?: 1 | 2 | 3 | 4 | 6 | 12;
    md?: 1 | 2 | 3 | 4 | 6 | 12;
    lg?: 1 | 2 | 3 | 4 | 6 | 12;
  };
  /** Gap between items */
  gap?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Additional CSS classes */
  className?: string;
  children: ReactNode;
}

const gridColumnStyles = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  6: "grid-cols-6",
  12: "grid-cols-12",
};

const gridGapStyles = {
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
};

/**
 * CSS Grid component with responsive columns
 *
 * @example
 * <Grid columns={3} gap="md">
 *   <Card>1</Card>
 *   <Card>2</Card>
 *   <Card>3</Card>
 * </Grid>
 *
 * <Grid responsive={{ sm: 1, md: 2, lg: 4 }} gap="lg">
 *   ...
 * </Grid>
 */
export const Grid = forwardRef<HTMLDivElement, GridProps>(
  ({ columns = 1, responsive, gap = "md", className, children, ...props }, ref) => {
    const responsiveClasses = responsive
      ? cn(
          responsive.sm && `sm:${gridColumnStyles[responsive.sm]}`,
          responsive.md && `md:${gridColumnStyles[responsive.md]}`,
          responsive.lg && `lg:${gridColumnStyles[responsive.lg]}`
        )
      : "";

    return (
      <div
        ref={ref}
        className={cn(
          "grid",
          gridColumnStyles[columns],
          gridGapStyles[gap],
          responsiveClasses,
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Grid.displayName = "Grid";

export default Container;
