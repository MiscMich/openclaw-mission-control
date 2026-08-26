"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/lib/convexApi";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { TimeAgo } from "@/components/ui/TimeAgo";
import { ConfirmDialog, MappedIcon, SearchInput } from "@/components/ui";
import { SessionViewerModal } from "@/components/sessions/SessionViewerModal";
import { useSessionsStream, type SessionStreamItem } from "@/hooks/useSessionsStream";
import { toast } from "sonner";

/** Extract agent ID from session key like "agent:builder:telegram:..." */
function extractAgentId(session: Pick<SessionStreamItem, "agentId" | "key">): string | undefined {
  if (session.agentId) return session.agentId;
  if (session.key) {
    const parts = session.key.split(":");
    // Format: "agent:<agentId>:<rest...>"
    if (parts[0] === "agent" && parts[1]) return parts[1];
  }
  return undefined;
}

type Agent = {
  id: string;
  name: string;
};

type SessionQuickFilter = "all" | "active" | "recent";

export function WorkersPanel() {
  const searchParams = useSearchParams();
  const {
    sessions,
    loading,
    error,
    refresh,
    lastUpdatedAt,
    streamConnected,
    isStale,
  } = useSessionsStream();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const stopAllCloseLockRef = useRef(false);
  const [stopAllDialogOpen, setStopAllDialogOpen] = useState(false);
  const agents = useQuery(api.agents.list, {}) as Agent[] | undefined;
  const focusSessionParam = searchParams.get("session")?.trim() ?? "";
  const focusSession = focusSessionParam.toLowerCase();

  const [search, setSearch] = useState("");
  const [searchInputKey, setSearchInputKey] = useState(0);
  const [quickFilter, setQuickFilter] = useState<SessionQuickFilter>("all");
  const [showAllRecent, setShowAllRecent] = useState(false);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const autoOpenHandledRef = useRef<Set<string>>(new Set());

  const agentsById = useMemo(() => new Map(agents?.map((a) => [a.id, a]) ?? []), [agents]);
  const streamState = !streamConnected
    ? "disconnected"
    : isStale
      ? "stale"
      : "live";
  const streamStateColor =
    streamState === "live"
      ? "var(--accent-success)"
      : streamState === "stale"
        ? "var(--accent-warning)"
        : "var(--accent-error)";

  const killAll = async () => {
    setActionLoading("all");
    setActionError(null);
    const toastId = toast.loading("Stopping all running sessions...");
    try {
      const res = await fetch("/api/sessions/kill-all", { method: "POST" });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok || data?.error) {
        throw new Error(data?.error ?? res.statusText ?? "Failed to stop sessions");
      }
      await refresh();
      toast.success("All sessions stopped", { id: toastId });
      setStopAllDialogOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to stop sessions";
      setActionError(message);
      toast.error("Failed to stop sessions", { id: toastId, description: message });
    } finally {
      setActionLoading(null);
      stopAllCloseLockRef.current = false;
    }
  };

  const getStatusColor = (status?: string) => {
    if (!status || status === "active" || status === "running") return "var(--accent-success)";
    if (status === "idle") return "var(--accent-primary)";
    if (status === "error" || status === "failed") return "var(--accent-error)";
    return "var(--text-dim)";
  };

  const isActiveSession = (session: SessionStreamItem) =>
    session.status === "active" || session.status === "running" || !session.status;

  const activeSessions = sessions.filter(isActiveSession);

  const normalizedSearch = search.trim().toLowerCase();
  const filtersActive = normalizedSearch.length > 0 || quickFilter !== "all";

  useEffect(() => {
    setShowAllRecent(false);
  }, [filtersActive, normalizedSearch, quickFilter]);

  const matchesSearch = (session: SessionStreamItem) => {
    if (!normalizedSearch) return true;
    const resolvedAgentId = extractAgentId(session);
    const agentName =
      resolvedAgentId && agentsById.has(resolvedAgentId)
        ? (agentsById.get(resolvedAgentId)?.name ?? "")
        : "";

    const haystack = [
      session.id,
      session.key,
      resolvedAgentId,
      session.agentId,
      agentName,
      session.model,
      session.status,
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    return haystack.some((value) => value.includes(normalizedSearch));
  };

  const searchedSessions = normalizedSearch ? sessions.filter(matchesSearch) : sessions;
  const visibleActiveSessions = searchedSessions.filter(isActiveSession);
  const visibleInactiveSessions = searchedSessions.filter((s) => !isActiveSession(s));

  const showActiveSection = quickFilter === "all" || quickFilter === "active";
  const showRecentSection = quickFilter === "all" || quickFilter === "recent";
  const visibleDisplayedCount =
    (showActiveSection ? visibleActiveSessions.length : 0) +
    (showRecentSection ? visibleInactiveSessions.length : 0);

  const RECENT_DEFAULT_LIMIT = 5;
  const RECENT_FILTER_LIMIT = 50;

  const recentLimit = filtersActive
    ? showAllRecent
      ? visibleInactiveSessions.length
      : RECENT_FILTER_LIMIT
    : RECENT_DEFAULT_LIMIT;

  const visibleInactiveCapped = visibleInactiveSessions.slice(0, recentLimit);

  const selectedSession = selectedSessionId
    ? sessions.find((s) => s.id === selectedSessionId) ?? null
    : null;
  const selectedAgentId = selectedSession ? extractAgentId(selectedSession) : undefined;
  const selectedAgentName = selectedAgentId ? agentsById.get(selectedAgentId)?.name : undefined;

  const openViewer = useCallback((session: SessionStreamItem) => {
    setSelectedSessionId(session.id);
    setViewerOpen(true);
  }, []);

  useEffect(() => {
    const param = focusSession.trim();
    if (!param) return;
    if (autoOpenHandledRef.current.has(param)) return;

    const matches = sessions.filter((session) => {
      const candidates = [session.id, session.key].filter(Boolean) as string[];
      return candidates.some((value) => value.toLowerCase().includes(param));
    });

    if (matches.length === 1) {
      autoOpenHandledRef.current.add(param);
      openViewer(matches[0]);
    }
  }, [focusSession, openViewer, sessions]);

  return (
    <GlassPanel padding="none">
      <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><MappedIcon name="activity" size="sm" /> Sessions</h2>
          <div className="text-xs mt-1 flex flex-wrap items-center gap-2" style={{ color: "var(--text-dim)" }}>
            <span>
              {activeSessions.length} active session{activeSessions.length !== 1 ? "s" : ""}
            </span>
            <span aria-hidden="true">-</span>
            <span style={{ color: streamStateColor }}>
              Live updates {streamState}
            </span>
            {lastUpdatedAt && (
              <>
                <span aria-hidden="true">-</span>
                <span>
                  Updated <TimeAgo timestamp={lastUpdatedAt} />
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
              <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setActionError(null);
              void refresh();
            }}
            disabled={loading}
          >
            {loading ? "..." : "Refresh"}
          </button>
          {activeSessions.length > 0 && (
            <button
              className="btn btn-sm"
              onClick={() => setStopAllDialogOpen(true)}
              disabled={actionLoading === "all"}
              style={{
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "var(--accent-error)",
              }}
            >
              {actionLoading === "all" ? "Stopping..." : "Stop All"}
            </button>
          )}
        </div>
      </div>

      <div className="p-4">
        <div
          className="text-xs mb-3 px-3 py-2 rounded-md"
          style={{
            color: "var(--text-dim)",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          Right now you can only stop everything at once (no per-session stop yet). Use
          <span className="font-medium"> Stop All</span> if you need to reset.
        </div>

        <div className="flex flex-col gap-2 mb-4">
          <SearchInput
            onChange={setSearch}
            placeholder="Search by agent, status, model…"
            className="w-full"
            key={searchInputKey}
          />
          <div className="flex items-center gap-2 flex-wrap">
            {(
              [
                { id: "all", label: "All" },
                { id: "active", label: `Active (${visibleActiveSessions.length})` },
                { id: "recent", label: `Recent (${visibleInactiveSessions.length})` },
              ] as const
            ).map((filter) => {
              const isSelected = quickFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setQuickFilter(filter.id)}
                  style={{
                    background: isSelected ? "var(--accent-soft)" : "transparent",
                    color: isSelected ? "var(--accent-primary)" : "var(--text-muted)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  {filter.label}
                </button>
              );
            })}
            {filtersActive && (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => {
                  setSearch("");
                  setSearchInputKey((current) => current + 1);
                  setQuickFilter("all");
                  setShowAllRecent(false);
                }}
                style={{
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-dim)",
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {loading && sessions.length === 0 ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-lg" style={{ opacity: 1 - i * 0.2 }} />
            ))}
          </div>
        ) : actionError || error ? (
          <div
            className="text-sm px-4 py-3 rounded-lg"
            style={{
              color: "var(--accent-error)",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
          >
            {actionError || error}
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="text-3xl mb-2"><MappedIcon name="pause" size="lg" /></div>
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>
              No active sessions
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
              Sessions will appear here when agents are running
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleDisplayedCount === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="text-3xl mb-2">
                  <MappedIcon name="search" size="lg" />
                </div>
                <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                  No sessions match your filters
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
                  Try a different search term or clear filters.
                </div>
              </div>
            ) : (
              <>
                {/* Active Sessions */}
                {showActiveSection && visibleActiveSessions.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
                      Active ({visibleActiveSessions.length})
                    </div>
                    {visibleActiveSessions.map((session) => {
                      const resolvedAgentId = extractAgentId(session); const agent = resolvedAgentId ? agentsById.get(resolvedAgentId) : null;
                      const sessionMatch = focusSession
                        ? [
                            session.id,
                            session.key,
                            resolvedAgentId,
                            session.agentId,
                          ]
                            .filter(Boolean)
                            .some((value) =>
                              String(value).toLowerCase().includes(focusSession)
                            )
                        : false;

                      return (
                        <div
                          key={session.id}
                          className="p-3 rounded-lg"
                          style={{
                            background: "var(--bg-elevated)",
                            border: sessionMatch
                              ? "1px solid var(--accent-primary)"
                              : "1px solid var(--border-subtle)",
                            boxShadow: sessionMatch
                              ? "0 0 0 1px var(--accent-primary)"
                              : "none",
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2 h-2 rounded-full animate-pulse"
                                  style={{ background: getStatusColor(session.status) }}
                                />
                                <span className="text-sm font-medium">
                                  {agent ? agent.name : (resolvedAgentId || session.agentId || "Unknown")}
                                </span>
                                {session.model && (
                                  <span
                                    className="text-xs px-1.5 py-0.5 rounded font-mono"
                                    style={{ background: "var(--bg-surface)", color: "var(--text-dim)" }}
                                  >
                                    {session.model}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
                                {session.pid && <span>PID: {session.pid}</span>}
                                {session.startedAt && (
                                  <span>
                                    Started: <TimeAgo timestamp={session.startedAt} />
                                  </span>
                                )}
                                {session.tokensUsed !== undefined && (
                                  <span>{session.tokensUsed.toLocaleString()} tokens</span>
                                )}
                                {session.cost !== undefined && (
                                  <span>${session.cost.toFixed(4)}</span>
                                )}
                                {session.key && (
                                  <span className="font-mono truncate" title={session.key}>
                                    Session: {session.key}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs"
                                onClick={() => openViewer(session)}
                                style={{
                                  border: "1px solid var(--border-subtle)",
                                  color: "var(--text-muted)",
                                }}
                              >
                                View
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Recent/Inactive Sessions */}
                {showRecentSection && visibleInactiveSessions.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
                      Recent ({visibleInactiveSessions.length})
                    </div>
                    {visibleInactiveCapped.map((session) => {
                      const resolvedAgentId = extractAgentId(session); const agent = resolvedAgentId ? agentsById.get(resolvedAgentId) : null;
                      const sessionMatch = focusSession
                        ? [session.id, session.key, resolvedAgentId, session.agentId]
                            .filter(Boolean)
                            .some((value) =>
                              String(value).toLowerCase().includes(focusSession)
                            )
                        : false;

                      return (
                        <div
                          key={session.id}
                          className="p-3 rounded-lg"
                          style={{
                            background: "var(--bg-elevated)",
                            border: sessionMatch
                              ? "1px solid var(--accent-primary)"
                              : "1px solid var(--border-subtle)",
                            boxShadow: sessionMatch
                              ? "0 0 0 1px var(--accent-primary)"
                              : "none",
                            opacity: 0.6,
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ background: getStatusColor(session.status) }}
                              />
                              <span className="text-sm truncate">
                                {agent ? agent.name : (resolvedAgentId || session.agentId || "Unknown")}
                              </span>
                              <span
                                className="text-xs px-1.5 py-0.5 rounded"
                                style={{ background: "var(--bg-surface)", color: "var(--text-dim)" }}
                              >
                                {session.status}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {session.lastActivity && (
                                <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                                  <TimeAgo timestamp={session.lastActivity} />
                                </span>
                              )}
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs"
                                onClick={() => openViewer(session)}
                                style={{
                                  border: "1px solid var(--border-subtle)",
                                  color: "var(--text-muted)",
                                }}
                              >
                                View
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {filtersActive && visibleInactiveSessions.length > RECENT_FILTER_LIMIT && (
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setShowAllRecent((prev) => !prev)}
                        >
                          {showAllRecent ? "Show less" : "Show more"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <SessionViewerModal
        open={viewerOpen}
        onOpenChange={(open) => {
          setViewerOpen(open);
          if (!open) {
            setSelectedSessionId(null);
          }
        }}
        session={selectedSession}
        agentId={selectedAgentId}
        agentName={selectedAgentName}
      />

      <ConfirmDialog
        open={stopAllDialogOpen}
        onOpenChange={(open) => {
          if (stopAllCloseLockRef.current || actionLoading === "all") return;
          setStopAllDialogOpen(open);
        }}
        title="Stop All Running Sessions?"
        description="This will immediately terminate all agents. This action cannot be undone."
        confirmLabel="Stop All"
        confirmVariant="danger"
        confirmLoading={actionLoading === "all"}
        onConfirm={() => {
          stopAllCloseLockRef.current = true;
          void killAll();
        }}
      />
    </GlassPanel>
  );
}
