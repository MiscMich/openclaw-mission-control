"use client";

import { memo } from "react";
import Link from "next/link";
import { StatusDot } from "@/components/ui/StatusDot";
import { TimeAgo } from "@/components/ui/TimeAgo";
import { KineticNumber } from "@/components/ui/KineticNumber";
import { useQuery } from "convex/react";
import { api } from "@/lib/convexApi";

export type AgentCardData = {
  id: string;
  name: string;
  emoji: string;
  role: string;
  model: string;
  status: string;
  lastSeen: number;
  currentTaskId?: string | null;
  totalCost?: number;
  totalTokens?: number;
};

export const AgentCard = memo(function AgentCard({
  agent,
  unreadCount = 0,
}: {
  agent: AgentCardData;
  unreadCount?: number;
}) {
  const isWorking = agent.status === "working";
  const currentTask = useQuery(
    api.tasks.getById,
    agent.currentTaskId ? { id: agent.currentTaskId } : "skip"
  );
  
  return (
    <Link
      href={`/agents/${agent.id}`}
      className={`agent-card ${isWorking ? "working" : ""}`}
      aria-label={`View ${agent.name} details`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`agent-avatar ${isWorking ? "working" : ""}`}>
            
          </div>
          <div className="agent-info">
            <div className="agent-name">{agent.name}</div>
            {agent.currentTaskId && (
              <div className="agent-current-task">
                {currentTask?.title ?? "Working\u2026"}
              </div>
            )}
            <div className="agent-role">{agent.role}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <span className="section-badge" style={{ fontSize: 9 }}>
              {unreadCount}
            </span>
          )}
          <StatusDot status={agent.status} pulse={isWorking} />
        </div>
      </div>
      
      <div className="flex items-center justify-between mt-2">
        <span className="agent-model">{agent.model}</span>
        <TimeAgo timestamp={agent.lastSeen} />
      </div>

      {/* Cost and Token Display */}
      {(agent.totalCost !== undefined || agent.totalTokens !== undefined) && (
        <div className="flex items-center justify-between gap-3 mt-2 pt-2 border-t border-[var(--border-subtle)]">
          {agent.totalCost !== undefined && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium text-[var(--text-dim)] uppercase tracking-wider">
                Cost
              </span>
              <span className="font-mono text-sm font-semibold tabular-nums" style={{ color: "var(--accent-primary)" }}>
                $<KineticNumber value={agent.totalCost} decimals={2} formatThousands={true} />
              </span>
            </div>
          )}
          {agent.totalTokens !== undefined && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium text-[var(--text-dim)] uppercase tracking-wider">
                Tokens
              </span>
              <span className="font-mono text-sm font-semibold tabular-nums text-[var(--text-secondary)]">
                <KineticNumber
                  value={agent.totalTokens >= 1_000_000
                    ? agent.totalTokens / 1_000_000
                    : agent.totalTokens >= 1_000
                      ? agent.totalTokens / 1_000
                      : agent.totalTokens
                  }
                  decimals={agent.totalTokens >= 1_000_000 ? 1 : agent.totalTokens >= 1_000 ? 0 : 0}
                  suffix={agent.totalTokens >= 1_000_000 ? "M" : agent.totalTokens >= 1_000 ? "K" : ""}
                  formatThousands={false}
                />
              </span>
            </div>
          )}
        </div>
      )}
    </Link>
  );
});
