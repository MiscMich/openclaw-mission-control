"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-[var(--accent-success)]" />,
        info: <InfoIcon className="size-4 text-[var(--accent-info)]" />,
        warning: <TriangleAlertIcon className="size-4 text-[var(--accent-warning)]" />,
        error: <OctagonXIcon className="size-4 text-[var(--accent-error)]" />,
        loading: <Loader2Icon className="size-4 animate-spin text-[var(--accent-primary)]" />,
      }}
      style={
        {
          "--normal-bg": "var(--bg-surface)",
          "--normal-text": "var(--text-primary)",
          "--normal-border": "var(--border-default)",
          "--border-radius": "var(--radius-md)",
          "--success-bg": "var(--accent-success-soft)",
          "--success-border": "var(--accent-success-strong)",
          "--success-text": "var(--accent-success)",
          "--error-bg": "var(--accent-error-soft)",
          "--error-border": "var(--accent-error-strong)",
          "--error-text": "var(--accent-error)",
          "--warning-bg": "var(--accent-warning-soft)",
          "--warning-border": "var(--accent-warning-strong)",
          "--warning-text": "var(--accent-warning)",
          "--info-bg": "var(--accent-info-soft)",
          "--info-border": "var(--accent-info-strong)",
          "--info-text": "var(--accent-info)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "bg-[var(--bg-surface)] border-[var(--border-default)] shadow-[var(--shadow-elevated)]",
          title: "text-[var(--text-primary)] font-semibold",
          description: "text-[var(--text-muted)]",
          actionButton: "bg-[var(--accent-primary)] text-white",
          cancelButton: "bg-[var(--bg-hover)] text-[var(--text-secondary)]",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
