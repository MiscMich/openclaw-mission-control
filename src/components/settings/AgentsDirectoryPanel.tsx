"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { AgentAvatar, TimeAgo } from "@/components/ui";
import { AgentFilters } from "@/components/agents/AgentFilters";
import { api } from "@/lib/convexApi";

type SortBy = "name" | "cost" | "tokens" | "lastSeen";
type SortOrder = "asc" | "desc";

type Agent = {
  id: string;
  name: string;
  role: string;
  model: string;
  status: "idle" | "working" | "offline" | "error";
  totalCost?: number;
  totalTokens?: number;
  lastSeen?: number;
};

const STATUS_COLOR: Record<Agent["status"], string> = {
  idle: "var(--text-dim)",
  working: "var(--accent-primary)",
  offline: "var(--text-muted)",
  error: "var(--accent-error)",
};

function formatTokens(value: number | undefined) {
  if (!value) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

export function AgentsDirectoryPanel() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const agents = useQuery(api.agents.list, {
    status,
    sortBy,
    sortOrder,
  }) as Agent[] | undefined;

  const clearFilters = useCallback(() => {
    setStatus(undefined);
    setSortBy("name");
    setSortOrder("asc");
  }, []);

  return (
    <section className="section-card">
      <div className="section-header">
        <h2 className="section-title">Agents</h2>
        <span className="section-badge">{agents?.length ?? 0} agents</span>
      </div>
      <div className="section-body">
        <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
          Open an agent to adjust its behavior (model, prompts, and defaults). Global settings live in the other tabs.
        </p>

        <AgentFilters
          status={status}
          onStatusChange={setStatus}
          sortBy={sortBy}
          onSortChange={setSortBy}
          sortOrder={sortOrder}
          onSortOrderChange={setSortOrder}
          onClearAll={clearFilters}
        />

        {!agents ? (
          <div className="space-y-2 mt-4">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="flex gap-3 items-center p-3 rounded-lg"
                style={{
                  opacity: 1 - i * 0.1,
                  background: "var(--bg-elevated)",
                }}
              >
                <div className="skeleton w-8 h-8 rounded-md flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-24 rounded" />
                  <div className="skeleton h-3 w-40 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-8" style={{ color: "var(--text-dim)" }}>
            <p>No agents match the current filters</p>
          </div>
        ) : (
          <div className="grid gap-2 mt-4">
            {agents.map((agent) => (
              <Link
                key={agent.id}
                href={`/agents/${agent.id}/settings`}
                className="agent-settings-card"
              >
                <AgentAvatar agentId={agent.id} name={agent.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {agent.name}
                    </div>
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: STATUS_COLOR[agent.status] }}
                      aria-label={`Status: ${agent.status}`}
                    />
                    <span className="text-xs uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>
                      {agent.status}
                    </span>
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {agent.role} • {agent.model}
                  </div>
                  <div className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
                    ${Number(agent.totalCost ?? 0).toFixed(2)} • {formatTokens(agent.totalTokens)} tokens •{" "}
                    {typeof agent.lastSeen === "number" ? <TimeAgo timestamp={agent.lastSeen} /> : "Never seen"}
                  </div>
                  <div className="text-xs mt-1" style={{ color: "var(--accent-primary)" }}>
                    Edit agent →
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        :global(.agent-settings-card) {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          transition: all var(--duration-fast);
          text-decoration: none;
        }

        :global(.agent-settings-card:hover) {
          background: var(--bg-hover);
          border-color: var(--border-hover);
          transform: translateX(4px);
        }
      `}</style>
    </section>
  );
}

export default AgentsDirectoryPanel;
