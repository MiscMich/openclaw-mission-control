"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type GatewayStatus = "healthy" | "unreachable" | "checking";

export interface GatewayHealth {
  status: GatewayStatus;
  lastCheck: number | null;
  errorMessage?: string;
  retryCount: number;
}

type SystemStreamPayload =
  | {
      ok: true;
      checkedAt?: number;
      openclaw?: {
        gatewayRunning?: boolean;
        errors?: string[];
      };
    }
  | {
      ok?: false;
      checkedAt?: number;
      error?: string;
    };

/**
 * Gateway health derived from the system SSE stream.
 * This avoids client-side polling loops while still keeping
 * header status live.
 */
export function useGatewayHealth(): GatewayHealth {
  const [status, setStatus] = useState<GatewayStatus>("checking");
  const [lastCheck, setLastCheck] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [retryCount, setRetryCount] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const lastHydrateAttemptRef = useRef(0);
  const STALE_AFTER_MS = 30_000;
  const DISCONNECTED_AFTER_MS = 180_000;
  const FALLBACK_STATUS_COOLDOWN_MS = 8_000;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const hydrateFromStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/openclaw/gateway/status", {
        cache: "no-store",
        signal: AbortSignal.timeout(2500),
      });
      if (!response.ok) return false;
      const payload = (await response.json()) as {
        running?: boolean;
        checkedAt?: number;
        error?: string;
      };
      const running = payload.running === true;
      setStatus(running ? "healthy" : "unreachable");
      setLastCheck(payload.checkedAt ?? Date.now());
      setErrorMessage(running ? undefined : payload.error || "Gateway status unavailable");
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const initialHydrateTimer = window.setTimeout(() => {
      if (!mounted) return;
      void hydrateFromStatus();
    }, 0);

    const source = new EventSource("/api/system/stream");

    source.onmessage = (event) => {
      if (!mounted) return;
      try {
        const payload = JSON.parse(event.data) as SystemStreamPayload;

        if (payload.ok) {
          const running = payload.openclaw?.gatewayRunning === true;
          const reportedError = payload.openclaw?.errors?.[0];

          setStatus(running ? "healthy" : "unreachable");
          setLastCheck(payload.checkedAt ?? Date.now());
          setErrorMessage(running ? undefined : reportedError);
          setRetryCount(0);
          return;
        }

        setStatus("unreachable");
        setLastCheck(payload.checkedAt ?? Date.now());
        setErrorMessage(payload.error || "Gateway status unavailable");
      } catch {
        setStatus("unreachable");
        setLastCheck(Date.now());
        setErrorMessage("Invalid gateway stream payload");
      }
    };

    source.onerror = () => {
      if (!mounted) return;
      setRetryCount((current) => current + 1);
      setErrorMessage("Live status feed interrupted. Reconnecting…");

      const nowTs = Date.now();
      if (nowTs - lastHydrateAttemptRef.current >= FALLBACK_STATUS_COOLDOWN_MS) {
        lastHydrateAttemptRef.current = nowTs;
        void hydrateFromStatus();
      }
    };

    return () => {
      mounted = false;
      window.clearTimeout(initialHydrateTimer);
      source.close();
    };
  }, [hydrateFromStatus]);

  const derivedStatus = useMemo<GatewayStatus>(() => {
    if (status === "unreachable") return "unreachable";
    if (lastCheck === null) return status;

    const ageMs = now - lastCheck;
    if (ageMs > DISCONNECTED_AFTER_MS) return "unreachable";
    if (ageMs > STALE_AFTER_MS) return "checking";
    return status;
  }, [status, lastCheck, now]);

  return {
    status: derivedStatus,
    lastCheck,
    errorMessage,
    retryCount,
  };
}
