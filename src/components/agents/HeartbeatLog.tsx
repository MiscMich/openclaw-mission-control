"use client";

import { TimeAgo } from "@/components/ui/TimeAgo";
import { useQuery } from "convex/react";
import { api } from "@/lib/convexApi";

type Activity = {
  id: string;
  agentId?: string;
  message: string;
  createdAt: number;
  type?: string;
};

export function HeartbeatLog({ agentId }: { agentId: string }) {
  const activity = useQuery(api.activity.listRecent, { limit: 50 }) as Activity[] | undefined;
  const loading = activity === undefined;
  const agentActivity = activity?.filter(
    (a) => a.agentId === agentId && a.type === "agent_heartbeat"
  ) ?? [];

  return (
    <div className="section-card h-fit">
      <div className="section-header">
        <h3 className="section-title">Heartbeat Log</h3>
        {agentActivity.length > 0 && (
          <span className="section-badge">{agentActivity.length}</span>
        )}
      </div>
      <div className="section-body">
        {loading || !activity ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton h-4 w-full rounded" />
            ))}
          </div>
        ) : agentActivity.length === 0 ? (
          <div 
            className="text-sm py-8 text-center rounded-lg"
            style={{ 
              color: "var(--text-dim)",
              background: "var(--bg-floating)"
            }}
          >
            No heartbeat events yet
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {agentActivity.slice(0, 15).map((beat) => (
              <div 
                key={beat.id} 
                className="flex items-start justify-between gap-3 py-2 px-3 rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
              >
                <span 
                  className="text-xs leading-relaxed flex-1"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {beat.message}
                </span>
                <TimeAgo timestamp={beat.createdAt} className="flex-shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
