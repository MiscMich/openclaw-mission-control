"use client";

import { memo, useMemo, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { api } from "@/lib/convexApi";
import { MappedIcon, CountBadge, AgentAvatar, AgentRowSkeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useSessionsStream } from "@/hooks/useSessionsStream";
import { canonicalAgentId } from "@/lib/agents/identity";

// =============================================================================
// TYPES
// =============================================================================

type Agent = {
  id: string;
  name: string;
  emoji: string;
  role: string;
  status: string;
  lastSeen?: number;
};

type NavItem = {
  href: string;
  label: string;
  icon: "tasks" | "dashboard" | "files" | "settings";
};

// =============================================================================
// CONSTANTS
// =============================================================================

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

const staggerTransition = {
  duration: 0.25,
};

const pulseTransition = {
  duration: 1.5,
  repeat: Infinity,
};

// =============================================================================
// NAV ITEM (Views section — uses MappedIcon)
// =============================================================================

interface NavItemProps {
  item: NavItem;
  isActive: boolean;
}

const NavItemComponent = memo(function NavItemComponent({ item, isActive }: NavItemProps) {
  return (
    <Link
      href={item.href}
      className={cn("sidebar-nav-item", isActive && "active")}
      aria-current={isActive ? "page" : undefined}
    >
      <MappedIcon name={item.icon} size="sm" />
      <span className="sidebar-nav-label">{item.label}</span>
    </Link>
  );
});

// =============================================================================
// AGENT ITEM (uses AgentAvatar + grid layout)
// =============================================================================

interface AgentItemProps {
  agent: Agent;
  isActive: boolean;
  notificationCount: number;
  statusOverride?: Agent["status"];
  onClick?: (agentId: string) => void;
  index: number;
}

const AgentItem = memo(function AgentItem({
  agent,
  isActive,
  notificationCount,
  statusOverride,
  onClick,
  index,
}: AgentItemProps) {
  const effectiveStatus = statusOverride ?? agent.status;
  const isRunning = effectiveStatus === "working";

  const handleClick = useCallback(() => {
    onClick?.(agent.id);
  }, [onClick, agent.id]);

  const content = (
    <>
      <AgentAvatar agentId={agent.id} name={agent.name} size="sm" />
      <div className="sidebar-agent-info">
        <span className="sidebar-agent-name">{agent.name}</span>
        <span className="sidebar-agent-role">{agent.role}</span>
      </div>
      <div className="sidebar-agent-indicators">
        {notificationCount > 0 && (
          <CountBadge
            count={notificationCount}
            size="sm"
            aria-label={`${notificationCount} unread notifications`}
          />
        )}
        <motion.span
          className={cn("sidebar-agent-dot", effectiveStatus)}
          animate={isRunning ? { scale: [1, 1.3, 1] } : { scale: 1 }}
          transition={isRunning ? pulseTransition : undefined}
          aria-label={isRunning ? "Currently working" : "Idle"}
        />
      </div>
    </>
  );

  const className = cn(
    "sidebar-agent-item",
    "transition-colors duration-150 hover:bg-white/5",
    isActive && "active",
    isRunning && "working"
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...staggerTransition, delay: index * 0.03 }}
      role="listitem"
    >
      {onClick ? (
        <button
          type="button"
          onClick={handleClick}
          className={className}
          aria-label={`View ${agent.name}${isRunning ? " - currently working" : ""}`}
        >
          {content}
        </button>
      ) : (
        <Link
          href={`/agents/${agent.id}`}
          className={className}
          aria-current={isActive ? "page" : undefined}
        >
          {content}
        </Link>
      )}
    </motion.div>
  );
});

// =============================================================================
// LOADING SKELETON
// =============================================================================

const AgentSkeleton = memo(function AgentSkeleton() {
  return (
    <div className="sidebar-agent-list" role="list" aria-busy="true" aria-label="Loading agents">
      <AgentRowSkeleton count={8} />
    </div>
  );
});

// =============================================================================
// MAIN COMPONENT
// =============================================================================

interface AgentSidebarProps {
  onAgentClick?: (agentId: string) => void;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

export const AgentSidebar = memo(function AgentSidebar({
  onAgentClick,
  isMobileOpen = false,
  onMobileClose,
}: AgentSidebarProps) {
  const pathname = usePathname();
  const agents = useQuery(api.agents.list, {}) as Agent[] | undefined;
  const undeliveredCounts = useQuery(api.notifications.listUndeliveredCounts, {});
  const { sessions, streamConnected, isStale } = useSessionsStream();

  const countsMap = useMemo(() => {
    const map = new Map<string, number>();
    if (undeliveredCounts) {
      for (const item of undeliveredCounts) {
        map.set(item.agentId, item.count);
      }
    }
    return map;
  }, [undeliveredCounts]);

  const uniqueAgents = useMemo(() => {
    if (!agents) return undefined;

    const orderedCanonicalIds: string[] = [];
    const byCanonicalId = new Map<string, Agent>();

    for (const agent of agents) {
      const canonicalId = canonicalAgentId(agent.id);
      const existing = byCanonicalId.get(canonicalId);
      if (!existing) {
        orderedCanonicalIds.push(canonicalId);
        byCanonicalId.set(canonicalId, agent);
        continue;
      }

      const existingLastSeen = existing.lastSeen ?? 0;
      const incomingLastSeen = agent.lastSeen ?? 0;
      if (incomingLastSeen > existingLastSeen) {
        byCanonicalId.set(canonicalId, agent);
      }
    }

    return orderedCanonicalIds
      .map((id) => byCanonicalId.get(id))
      .filter((agent): agent is Agent => Boolean(agent));
  }, [agents]);

  const workingAgentsFromSessions = useMemo(() => {
    const set = new Set<string>();
    for (const session of sessions) {
      const sessionAgentId = session.agentId;
      if (!sessionAgentId) continue;
      const status = session.status ?? "running";
      if (status === "running" || status === "active") {
        set.add(canonicalAgentId(sessionAgentId));
      }
    }
    return set;
  }, [sessions]);

  const sessionStreamState = streamConnected ? (isStale ? "stale" : "live") : "disconnected";
  const canTrustSessionStream = streamConnected && !isStale;

  const activeNavItem = useMemo(() => {
    return NAV_ITEMS.find((item) => item.href === pathname)?.href;
  }, [pathname]);

  return (
    <>
      {isMobileOpen && (
        <div
          className="mobile-sidebar-overlay"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        id="mobile-sidebar"
        className={cn("agent-sidebar", isMobileOpen && "mobile-open")}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Logo */}
        <div className="sidebar-header">
          <Link href="/" className="sidebar-logo" aria-label="OpenClaw Mission Control Home">
            <div className="sidebar-logo-icon">
              <MappedIcon name="lightning" size="sm" />
            </div>
            <span>OpenClaw Mission Control</span>
          </Link>
        </div>

        <nav className="sidebar-agents">
          {/* Navigation Section */}
          <div className="sidebar-section-label">Views</div>
          <div className="sidebar-nav-list" role="list">
            {NAV_ITEMS.map((item) => (
              <NavItemComponent
                key={item.href}
                item={item}
                isActive={activeNavItem === item.href}
              />
            ))}
          </div>

          {/* Agents Section */}
          <div className="sidebar-section-label">
            Agents
            <span
              className="ml-2 text-[10px] font-normal normal-case"
              style={{
                color:
                  sessionStreamState === "live"
                    ? "var(--accent-success)"
                    : sessionStreamState === "stale"
                      ? "var(--accent-warning)"
                      : "var(--accent-error)",
              }}
            >
              {sessionStreamState}
            </span>
          </div>
          {!uniqueAgents ? (
            <AgentSkeleton />
          ) : (
            <div className="sidebar-agent-list" role="list" aria-label="AI Agents">
              {uniqueAgents.map((agent, index) => (
                <AgentItem
                  key={agent.id}
                  agent={agent}
                  isActive={pathname === `/agents/${agent.id}`}
                  notificationCount={countsMap.get(agent.id) ?? 0}
                  statusOverride={
                    canTrustSessionStream
                      ? workingAgentsFromSessions.has(canonicalAgentId(agent.id))
                        ? "working"
                        : agent.status === "working"
                          ? "idle"
                          : agent.status
                      : undefined
                  }
                  onClick={onAgentClick}
                  index={index}
                />
              ))}
            </div>
          )}
        </nav>

      </aside>
    </>
  );
});

export default AgentSidebar;
