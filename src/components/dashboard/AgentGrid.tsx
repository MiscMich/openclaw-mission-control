"use client";

import { memo } from "react";
import { AgentCard } from "@/components/agents/AgentCard";
import { MappedIcon, AgentCardSkeleton } from "@/components/ui";
import { useQuery } from "convex/react";
import { api } from "@/lib/convexApi";

export const AgentGrid = memo(function AgentGrid() {
  const agents = useQuery(api.agents.list, {});
  const undeliveredCounts = useQuery(api.notifications.listUndeliveredCounts, {});
  const loading = agents === undefined;
  const workingCount = agents?.filter((a) => a.status === "working").length ?? 0;
  const countsMap = new Map(
    (undeliveredCounts ?? []).map((item) => [item.agentId, item.count])
  );

  return (
    <section className="section-card">
      <div className="section-header">
        <div className="flex items-center gap-3">
          <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <MappedIcon name="agents" size="sm" />
              Agents
            </h2>
          {workingCount > 0 && (
            <span className="live-indicator">
              {workingCount} active
            </span>
          )}
        </div>
        <span className="section-badge">
          {agents ? agents.length : "—"} total
        </span>
      </div>
      <div className="section-body">
        {loading || !agents ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <AgentCardSkeleton count={6} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                unreadCount={countsMap.get(agent.id) ?? 0}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
});
