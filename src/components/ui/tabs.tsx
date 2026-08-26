"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  [
    "rounded-[var(--radius-md)] p-[3px]",
    "group-data-[orientation=horizontal]/tabs:h-9",
    "data-[variant=line]:rounded-none",
    "group/tabs-list",
    "text-[var(--text-muted)]",
    "inline-flex w-fit items-center justify-center",
    "group-data-[orientation=vertical]/tabs:h-fit",
    "group-data-[orientation=vertical]/tabs:flex-col",
  ],
  {
    variants: {
      variant: {
        default: "bg-[var(--bg-elevated)] border border-[var(--border-subtle)]",
        line: "gap-1 bg-transparent border-b border-[var(--border-subtle)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // Base styles
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5",
        "rounded-[var(--radius-sm)] border border-transparent px-3 py-1",
        "text-[13px] font-semibold whitespace-nowrap",
        "transition-colors duration-[var(--duration-fast)]",
        // Text colors
        "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
        // Focus styles
        "focus-visible:outline-none",
        "focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]",
        "focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]",
        // Disabled
        "disabled:pointer-events-none disabled:opacity-50",
        // Vertical orientation
        "group-data-[orientation=vertical]/tabs:w-full",
        "group-data-[orientation=vertical]/tabs:justify-start",
        // Active state - default variant
        "group-data-[variant=default]/tabs-list:data-[state=active]:bg-[var(--bg-surface)]",
        "group-data-[variant=default]/tabs-list:data-[state=active]:text-[var(--text-primary)]",
        "group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm",
        // Active state - line variant
        "group-data-[variant=line]/tabs-list:bg-transparent",
        "group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
        "group-data-[variant=line]/tabs-list:data-[state=active]:text-[var(--text-primary)]",
        // Line indicator for line variant
        "after:absolute after:opacity-0 after:transition-opacity",
        "after:bg-[var(--accent-primary)]",
        "group-data-[orientation=horizontal]/tabs:after:inset-x-0",
        "group-data-[orientation=horizontal]/tabs:after:bottom-[-5px]",
        "group-data-[orientation=horizontal]/tabs:after:h-0.5",
        "group-data-[orientation=vertical]/tabs:after:inset-y-0",
        "group-data-[orientation=vertical]/tabs:after:-right-1",
        "group-data-[orientation=vertical]/tabs:after:w-0.5",
        "group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
        // SVG styling
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
