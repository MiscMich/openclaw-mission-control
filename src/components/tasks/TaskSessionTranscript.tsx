"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, GlassPanel, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { GatewayChatHistoryMessage } from "@/lib/openclaw/types";

type TranscriptFetchResult = {
  ok: boolean;
  error?: string;
  sessionKey?: string;
  messages?: GatewayChatHistoryMessage[];
};

function contentBlockToText(block: unknown): string {
  if (!block || typeof block !== "object") return "";
  const candidate = block as Record<string, unknown>;

  if (typeof candidate.text === "string" && candidate.text.trim()) {
    return candidate.text.trim();
  }
  if (typeof candidate.thinking === "string" && candidate.thinking.trim()) {
    return `[thinking] ${candidate.thinking.trim()}`;
  }
  return "";
}

function normalizeGatewayMessageText(content: unknown): string {
  if (typeof content === "string") return content;

  // Some gateway payloads may ship a single content object instead of an array.
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const normalized = contentBlockToText(content);
    return normalized ? normalized : "";
  }

  if (!Array.isArray(content)) return "";

  const parts = content
    .map((block) => contentBlockToText(block))
    .filter((value) => value.length > 0);
  return parts.join("\n\n");
}

type TranscriptItem = {
  id: string;
  role: string;
  timestamp?: number;
  text: string;
  index: number;
};

export interface TaskSessionTranscriptProps {
  sessionKey?: string;
  limit?: number;
  className?: string;
}

export const TaskSessionTranscript = memo(function TaskSessionTranscript({
  sessionKey,
  limit = 200,
  className,
}: TaskSessionTranscriptProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<GatewayChatHistoryMessage[] | null>(
    null
  );

  const loadHistory = useCallback(async () => {
    const key = sessionKey?.trim() ?? "";
    if (!key) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/openclaw/chat/history?sessionKey=${encodeURIComponent(
          key
        )}&limit=${encodeURIComponent(String(limit))}`
      );

      const payload = (await response.json().catch(() => null)) as
        | TranscriptFetchResult
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Failed to load chat transcript");
      }

      setMessages(Array.isArray(payload.messages) ? payload.messages : []);
    } catch (err) {
      setMessages(null);
      setError(err instanceof Error ? err.message : "Failed to load transcript");
    } finally {
      setLoading(false);
    }
  }, [limit, sessionKey]);

  useEffect(() => {
    if (!sessionKey?.trim()) {
      setMessages(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      await loadHistory();
      if (cancelled) return;
    })();

    return () => {
      cancelled = true;
    };
  }, [loadHistory, sessionKey]);

  const transcript = useMemo<TranscriptItem[]>(() => {
    if (!Array.isArray(messages)) return [];

    const items = messages
      .map((message, index) => {
        const text = normalizeGatewayMessageText(message.content).trim();
        const timestamp =
          typeof message.timestamp === "number" && Number.isFinite(message.timestamp)
            ? message.timestamp
            : undefined;

        return {
          id: `${timestamp ?? "no-ts"}-${index}`,
          role: typeof message.role === "string" ? message.role : "unknown",
          timestamp,
          text,
          index,
        };
      })
      .filter((item) => item.text.length > 0);

    items.sort((a, b) => {
      if (a.timestamp !== undefined && b.timestamp !== undefined) {
        if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      }
      return a.index - b.index;
    });

    return items;
  }, [messages]);

  if (!sessionKey?.trim()) {
    return (
      <GlassPanel className={cn(className)} padding="lg">
        <EmptyState
          title="No transcript available"
          description="This task does not have a session yet."
        />
      </GlassPanel>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <div
          className="text-xs uppercase font-semibold tracking-wider"
          style={{ color: "var(--text-dim)" }}
        >
          Chat Transcript
        </div>
        <Button
          variant="ghost"
          size="sm"
          mappedIcon="refresh"
          loading={loading}
          onClick={loadHistory}
        >
          Refresh
        </Button>
      </div>

      <GlassPanel padding="none" className="overflow-hidden">
        <div className="p-4">
          {loading && messages === null ? (
            <div className="space-y-3">
              <Skeleton height={14} width="60%" />
              <Skeleton height={56} />
              <Skeleton height={14} width="45%" />
              <Skeleton height={72} />
            </div>
          ) : error ? (
            <EmptyState
              title="Transcript load failed"
              description={error}
              action={
                <Button variant="secondary" size="sm" onClick={loadHistory}>
                  Try again
                </Button>
              }
            />
          ) : transcript.length === 0 ? (
            <EmptyState
              title="No messages yet"
              description="No chat messages recorded for this session yet."
            />
          ) : (
            <div className="space-y-3">
              {transcript.map((item) => {
                const roleLabel =
                  item.role === "user"
                    ? "User"
                    : item.role === "assistant"
                      ? "Assistant"
                      : item.role;
                const timestampLabel = item.timestamp
                  ? new Date(item.timestamp).toLocaleString()
                  : "—";

                return (
                  <div
                    key={item.id}
                    className="rounded-lg p-3"
                    style={{
                      border: "1px solid var(--hairline)",
                      background: "var(--bg-floating)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="text-[11px] uppercase font-semibold tracking-wider"
                          style={{ color: "var(--text-dim)" }}
                        >
                          {roleLabel}
                        </span>
                      </div>
                      <span
                        className="text-[11px] whitespace-nowrap"
                        style={{ color: "var(--text-dim)" }}
                        title={item.timestamp ? new Date(item.timestamp).toISOString() : undefined}
                      >
                        {timestampLabel}
                      </span>
                    </div>
                    <pre
                      className="mt-2 text-sm whitespace-pre-wrap break-words"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {item.text}
                    </pre>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </GlassPanel>
    </div>
  );
});
