"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "convex/react";
import { api } from "@/lib/convexApi";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { KineticNumber } from "@/components/ui/KineticNumber";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Agent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  status: string;
  model: string;
  totalCost: number;
  totalTokens?: number;
  currentTaskId?: string;
  lastSeen: number;
}

interface TaskSummary {
  id: string;
  title: string;
  status: string;
}

interface ActivitySummary {
  id: string;
  message: string;
  createdAt: number;
}

interface AgentSlideInProps {
  agentId: string | null;
  onClose: () => void;
}

export function AgentSlideIn({ agentId, onClose }: AgentSlideInProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [heartbeatLoading, setHeartbeatLoading] = useState(false);
  const agents = useQuery(api.agents.list, {}) as Agent[] | undefined;
  const agent = agents?.find((a) => a.id === agentId) ?? null;

  // Get agent's current task if any
  const tasksResult = useQuery(api.tasks.list, {});
  const tasks = (tasksResult?.tasks ?? []) as TaskSummary[];
  const currentTask = tasks.find((task) => task.id === agent?.currentTaskId);

  // Get recent activity for this agent
  const activityResult = useQuery(api.activity.list, {
    agentId: agentId || undefined,
    limit: 3,
  });
  const agentActivity = (activityResult?.activities ?? []) as ActivitySummary[];

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (agentId) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [agentId, onClose]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (agentId) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [agentId, onClose]);

  const statusColors: Record<string, string> = {
    idle: "var(--state-idle)",
    working: "var(--state-running)",
    offline: "var(--state-idle)",
    error: "var(--state-error)",
  };

  const statusLabels: Record<string, string> = {
    idle: "Idle",
    working: "Working",
    offline: "Offline",
    error: "Error",
  };

  const handleRunHeartbeat = async () => {
    if (!agent) return;

    try {
      setHeartbeatLoading(true);
      const response = await fetch(`/api/agents/${agent.id}/heartbeat/trigger`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        tasks?: number;
        notifications?: number;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Failed to trigger heartbeat");
      }

      toast.success(`Heartbeat triggered for ${agent.name}`, {
        description: `${payload.tasks ?? 0} tasks · ${payload.notifications ?? 0} notifications`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to trigger heartbeat");
    } finally {
      setHeartbeatLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {agentId && agent && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "fixed top-0 right-0 bottom-0 z-50",
              "w-full max-w-[400px]",
              "bg-[var(--bg-surface)] border-l border-[var(--border-subtle)]",
              "flex flex-col shadow-2xl"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center text-2xl",
                    "bg-[var(--bg-elevated)] border border-[var(--border-subtle)]",
                    agent.status === "working" && "border-[var(--accent-strong)] shadow-[0_0_16px_var(--glow)]"
                  )}
                >
                  {agent.emoji || agent.name.slice(0, 2)}
                </div>
                <div>
                  <h2 className="text-lg font-semibold">{agent.name}</h2>
                  <p className="text-sm text-[var(--text-muted)]">{agent.role}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                  "hover:bg-[var(--bg-hover)] transition-colors",
                  "max-[768px]:w-11 max-[768px]:h-11 max-[768px]:min-w-[44px] max-[768px]:min-h-[44px]"
                )}
                aria-label="Close panel"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Status */}
              <GlassPanel padding="md">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--text-muted)]">Status</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "w-2.5 h-2.5 rounded-full",
                        agent.status === "working" && "animate-pulse"
                      )}
                      style={{ background: statusColors[agent.status] || statusColors.idle }}
                    />
                    <span
                      className="text-sm font-medium"
                      style={{ color: statusColors[agent.status] || statusColors.idle }}
                    >
                      {statusLabels[agent.status] || agent.status}
                    </span>
                  </div>
                </div>
              </GlassPanel>

              {/* Current Task */}
              {currentTask && (
                <GlassPanel padding="md">
                  <div className="text-xs text-[var(--text-dim)] uppercase tracking-wider mb-2">
                    Current Task
                  </div>
                  <Link
                    href={`/tasks/${currentTask.id}`}
                    className="block text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent-primary)] transition-colors"
                  >
                    {currentTask.title}
                  </Link>
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: "var(--accent-soft)",
                        color: "var(--accent-primary)",
                      }}
                    >
                      {currentTask.status.replace("_", " ")}
                    </span>
                  </div>
                </GlassPanel>
              )}

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <GlassPanel padding="sm">
                  <div className="text-xs text-[var(--text-dim)] uppercase tracking-wider mb-1">
                    Total Cost
                  </div>
                  <KineticNumber
                    value={agent.totalCost}
                    prefix="$"
                    decimals={2}
                    className="text-lg font-bold"
                  />
                </GlassPanel>
                <GlassPanel padding="sm">
                  <div className="text-xs text-[var(--text-dim)] uppercase tracking-wider mb-1">
                    Tokens
                  </div>
                  <KineticNumber
                    value={agent.totalTokens || 0}
                    className="text-lg font-bold"
                  />
                </GlassPanel>
              </div>

              {/* Model */}
              <GlassPanel padding="md">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--text-muted)]">Model</span>
                  <span className="text-xs font-mono text-[var(--text-secondary)] px-2 py-1 rounded bg-[var(--bg-elevated)]">
                    {agent.model}
                  </span>
                </div>
              </GlassPanel>

              {/* Recent Activity */}
              {agentActivity && agentActivity.length > 0 && (
                <div>
                  <div className="text-xs text-[var(--text-dim)] uppercase tracking-wider mb-2 px-1">
                    Recent Activity
                  </div>
                  <div className="space-y-2">
                    {agentActivity.map((item) => (
                      <GlassPanel key={item.id} padding="sm">
                        <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                          {item.message}
                        </p>
                        <p className="text-[10px] text-[var(--text-dim)] mt-1">
                          {new Date(item.createdAt).toLocaleTimeString()}
                        </p>
                      </GlassPanel>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-[var(--border-subtle)] space-y-2">
              <Button
                variant="secondary"
                className="w-full"
                mappedIcon="clock"
                loading={heartbeatLoading}
                onClick={handleRunHeartbeat}
              >
                Run Heartbeat Now
              </Button>
              <Button
                asChild
                variant="default"
                className="w-full"
              >
                <Link href={`/agents/${agent.id}`} onClick={onClose}>
                  View Details
                </Link>
              </Button>
              <Link
                href={`/agents/${agent.id}/settings`}
                className="btn btn-secondary w-full"
                onClick={onClose}
              >
                Settings
              </Link>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default AgentSlideIn;
