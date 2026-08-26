"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type SessionStreamItem = {
  id: string;
  key?: string;
  agentId?: string;
  agent?: string;
  status?: string;
  startedAt?: number;
  lastActivity?: number;
  updatedAt?: number;
  pid?: number;
  model?: string;
  tokensUsed?: number;
  totalTokens?: number;
  cost?: number;
};

type SessionsResponseShape =
  | SessionStreamItem[]
  | { sessions?: SessionStreamItem[]; data?: SessionStreamItem[]; error?: string };

function normalizeSessions(raw: SessionsResponseShape): SessionStreamItem[] {
  const source = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.sessions)
      ? raw.sessions
      : Array.isArray(raw.data)
        ? raw.data
        : [];

  return source.map((session) => ({
    ...session,
    id:
      session.id ??
      session.key ??
      `session-${session.agentId ?? session.agent ?? "unknown"}-${
        session.startedAt ?? session.updatedAt ?? 0
      }`,
    agentId: session.agentId ?? session.agent,
    lastActivity: session.lastActivity ?? session.updatedAt,
    tokensUsed: session.tokensUsed ?? session.totalTokens,
  }));
}

export function useSessionsStream() {
  const [sessions, setSessions] = useState<SessionStreamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [eventSourceOpen, setEventSourceOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const lastRefreshAttemptRef = useRef(0);
  const STALE_AFTER_MS = 30_000;
  const DISCONNECTED_AFTER_MS = 180_000;
  const ERROR_REFRESH_COOLDOWN_MS = 4_000;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions", { cache: "no-store" });
      const data = (await res.json()) as SessionsResponseShape;
      if (!res.ok) {
        const message =
          typeof data === "object" && data && "error" in data && typeof data.error === "string"
            ? data.error
            : `API returned ${res.status}`;
        throw new Error(message);
      }
      setSessions(normalizeSessions(data));
      setError(null);
      setLastUpdatedAt(Date.now());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(tick);
    };
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof EventSource === "undefined") {
      const interval = window.setInterval(() => {
        void refresh();
      }, 5000);
      return () => {
        window.clearInterval(interval);
      };
    }

    const source = new EventSource("/api/sessions/stream");

    source.onopen = () => {
      setEventSourceOpen(true);
      setError(null);
    };

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          ok?: boolean;
          error?: string;
          checkedAt?: number;
          sessions?: SessionStreamItem[];
        };

        if (payload.ok) {
          setSessions(normalizeSessions(payload.sessions ?? []));
          setError(null);
          setLastUpdatedAt(payload.checkedAt ?? Date.now());
          setEventSourceOpen(true);
        } else {
          setError(payload.error || "Failed to load sessions");
        }
      } catch {
        setError("Invalid session stream payload");
      } finally {
        setLoading(false);
      }
    };

    source.onerror = () => {
      setEventSourceOpen(false);
      setError("Live session feed interrupted. Reconnecting…");
      const nowTs = Date.now();
      if (nowTs - lastRefreshAttemptRef.current >= ERROR_REFRESH_COOLDOWN_MS) {
        lastRefreshAttemptRef.current = nowTs;
        void refresh();
      }
      setLoading(false);
    };

    return () => {
      source.close();
    };
  }, [refresh]);

  const ageMs = lastUpdatedAt === null ? Number.POSITIVE_INFINITY : now - lastUpdatedAt;
  const isStale = lastUpdatedAt === null ? true : ageMs > STALE_AFTER_MS;
  const streamConnected = useMemo(() => {
    if (eventSourceOpen) return true;
    if (lastUpdatedAt === null) return false;
    return ageMs <= DISCONNECTED_AFTER_MS;
  }, [eventSourceOpen, lastUpdatedAt, ageMs]);

  return {
    sessions,
    loading,
    error,
    refresh,
    lastUpdatedAt,
    streamConnected,
    isStale,
  };
}
