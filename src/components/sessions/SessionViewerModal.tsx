"use client";

import { useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { toast } from "sonner";

import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  EmptyState,
  GlassPanel,
  MappedIcon,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TimeAgo,
} from "@/components/ui";
import { TaskSessionTranscript } from "@/components/tasks/TaskSessionTranscript";
import type { SessionStreamItem } from "@/hooks/useSessionsStream";

const LiveTerminal = dynamic(
  () => import("@/components/dashboard/LiveTerminal").then((m) => m.LiveTerminal),
  {
    ssr: false,
    loading: () => (
      <GlassPanel padding="lg" className="h-full">
        <div className="space-y-3">
          <Skeleton height={12} width="30%" />
          <Skeleton height={220} />
        </div>
      </GlassPanel>
    ),
  }
);

export type SessionViewerModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: SessionStreamItem | null;
  agentId?: string;
  agentName?: string;
};

function statusLabel(status?: string) {
  const value = (status ?? "").trim();
  return value.length > 0 ? value : "active";
}

function statusColor(status?: string) {
  const value = (status ?? "").trim();
  if (!value || value === "active" || value === "running") return "var(--accent-success)";
  if (value === "idle") return "var(--accent-primary)";
  if (value === "error" || value === "failed") return "var(--accent-error)";
  return "var(--text-dim)";
}

export function SessionViewerModal({
  open,
  onOpenChange,
  session,
  agentId,
  agentName,
}: SessionViewerModalProps) {
  const displayAgent = agentName ?? agentId ?? session?.agentId ?? "Unknown";
  const displayStatus = statusLabel(session?.status);
  const displayModel = session?.model?.trim() ? session.model : null;

  const sessionKey = session?.key?.trim() ?? "";
  const sessionId = session?.id?.trim() ?? "";
  const streamSessionId = session?.key ?? session?.id ?? undefined;

  const updatedAt = session?.updatedAt ?? session?.lastActivity ?? null;
  const startedAt = session?.startedAt ?? null;

  const opsDeepLink = useMemo(() => {
    if (!session) return null;
    const target = (session.key ?? session.id).trim();
    if (!target) return null;
    return `/?tab=operations&session=${encodeURIComponent(target)}`;
  }, [session]);

  const commsDeepLink = useMemo(() => {
    if (!agentId?.trim()) return null;
    return `/?tab=comms&chat=thread&chatAgent=${encodeURIComponent(agentId.trim())}`;
  }, [agentId]);

  const handleCopySessionKey = useCallback(async () => {
    const value = sessionKey || sessionId;
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      toast.success(sessionKey ? "Session key copied" : "Session ID copied");
    } catch {
      toast.error("Failed to copy session identifier");
    }
  }, [sessionId, sessionKey]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="session-viewer-modal p-0 gap-0 flex flex-col"
        showCloseButton
      >
        <div
          className="px-5 py-4 border-b"
          style={{
            borderColor: "var(--border-subtle)",
            background: "var(--bg-floating)",
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2">
                <MappedIcon name="terminal" size="sm" />
                Session Viewer
              </DialogTitle>
              <div className="mt-1 text-xs flex flex-wrap items-center gap-2" style={{ color: "var(--text-dim)" }}>
                <span className="truncate" title={String(displayAgent)}>
                  {displayAgent}
                </span>
                <span aria-hidden="true">-</span>
                <span className="inline-flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: statusColor(session?.status) }}
                    aria-hidden="true"
                  />
                  <span>{displayStatus}</span>
                </span>
                {displayModel && (
                  <>
                    <span aria-hidden="true">-</span>
                    <span className="font-mono">{displayModel}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                mappedIcon="copy"
                disabled={!sessionKey && !sessionId}
                onClick={() => void handleCopySessionKey()}
              >
                Copy
              </Button>
              {opsDeepLink && (
                <Button variant="ghost" size="sm" mappedIcon="link" asChild>
                  <Link href={opsDeepLink}>Schedules</Link>
                </Button>
              )}
              {commsDeepLink && (
                <Button variant="ghost" size="sm" mappedIcon="message" asChild>
                  <Link href={commsDeepLink}>Messages</Link>
                </Button>
              )}
            </div>
          </div>
        </div>

        {!session ? (
          <div className="p-5">
            <GlassPanel padding="lg">
              <EmptyState
                title="Session not available"
                description="This session is no longer present in the stream."
              />
            </GlassPanel>
          </div>
        ) : (
          <div className="session-viewer-body">
            <GlassPanel padding="lg" className="session-viewer-meta">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase font-semibold tracking-wider" style={{ color: "var(--text-dim)" }}>
                    Agent
                  </div>
                  <div className="text-sm mt-1 truncate" title={String(displayAgent)}>
                    {displayAgent}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] uppercase font-semibold tracking-wider" style={{ color: "var(--text-dim)" }}>
                    Updated
                  </div>
                  <div className="mt-1">
                    <TimeAgo timestamp={updatedAt} className="text-sm" />
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] uppercase font-semibold tracking-wider" style={{ color: "var(--text-dim)" }}>
                    Session Key
                  </div>
                  <div className="text-sm mt-1 font-mono truncate" title={sessionKey || "—"}>
                    {sessionKey || "—"}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] uppercase font-semibold tracking-wider" style={{ color: "var(--text-dim)" }}>
                    Session ID
                  </div>
                  <div className="text-sm mt-1 font-mono truncate" title={sessionId}>
                    {sessionId}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] uppercase font-semibold tracking-wider" style={{ color: "var(--text-dim)" }}>
                    Status
                  </div>
                  <div className="text-sm mt-1 flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: statusColor(session.status) }}
                      aria-hidden="true"
                    />
                    <span>{displayStatus}</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] uppercase font-semibold tracking-wider" style={{ color: "var(--text-dim)" }}>
                    Started
                  </div>
                  <div className="mt-1">
                    <TimeAgo timestamp={startedAt} className="text-sm" />
                  </div>
                </div>
              </div>
            </GlassPanel>

            <Tabs defaultValue="transcript" className="session-viewer-tabs">
              <TabsList variant="line" className="w-full justify-start">
                <TabsTrigger value="transcript">Transcript</TabsTrigger>
                <TabsTrigger value="logs">Logs</TabsTrigger>
              </TabsList>

              <TabsContent value="transcript" className="session-viewer-tab-panel">
                <TaskSessionTranscript sessionKey={sessionKey || undefined} />
              </TabsContent>

              <TabsContent value="logs" className="session-viewer-terminal-panel" forceMount>
                {streamSessionId ? (
                  <div className="session-viewer-terminal">
                    <LiveTerminal sessionId={streamSessionId} agentName={displayAgent} />
                  </div>
                ) : (
                  <GlassPanel padding="lg" className="h-full">
                    <EmptyState
                      title="No session stream available"
                      description="This session does not have an identifier to filter logs."
                    />
                  </GlassPanel>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}

        <style jsx>{`
          .session-viewer-modal {
            max-width: 1020px;
            max-height: 90vh;
            overflow: hidden;
          }

          .session-viewer-body {
            padding: 16px 20px 20px;
            display: flex;
            flex-direction: column;
            gap: 14px;
            flex: 1;
            min-height: 0;
            overflow: hidden;
          }

          .session-viewer-meta {
            flex-shrink: 0;
          }

          .session-viewer-tabs {
            flex: 1;
            min-height: 0;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }

          .session-viewer-tab-panel {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            padding-top: 12px;
          }

          .session-viewer-terminal-panel {
            flex: 1;
            min-height: 0;
            overflow: hidden;
            padding-top: 12px;
          }

          .session-viewer-terminal {
            height: 100%;
            min-height: 420px;
            overflow: hidden;
            border-radius: var(--radius-lg);
            border: 1px solid var(--border-subtle);
          }
        `}</style>
      </DialogContent>
    </Dialog>
  );
}
