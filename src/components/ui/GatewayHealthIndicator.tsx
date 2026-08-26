"use client";

import { memo, useEffect, useRef } from "react";
import { useGatewayHealth, type GatewayStatus } from "@/hooks/useGatewayHealth";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_CONFIG: Record<GatewayStatus, { color: string; label: string; pulse: boolean }> = {
  healthy: {
    color: "#4ade80",
    label: "Connected",
    pulse: false,
  },
  unreachable: {
    color: "#ef4444",
    label: "Offline",
    pulse: true,
  },
  checking: {
    color: "#f59e0b",
    label: "Checking…",
    pulse: true,
  },
};

function formatTimestamp(timestamp: number | null): string {
  if (!timestamp) return "Never";
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 1000) return "Just now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return new Date(timestamp).toLocaleTimeString();
}

export const GatewayHealthIndicator = memo(function GatewayHealthIndicator() {
  const health = useGatewayHealth();
  const config = STATUS_CONFIG[health.status];
  const previousStatusRef = useRef<GatewayStatus | null>(null);
  const lastToastAtRef = useRef(0);
  const sawDegradedStateRef = useRef(false);

  useEffect(() => {
    const previous = previousStatusRef.current;
    previousStatusRef.current = health.status;
    if (previous === null) return;

    if (health.status === "checking" || health.status === "unreachable") {
      sawDegradedStateRef.current = true;
    }

    if (previous === health.status) return;

    const nowTs = Date.now();
    if (nowTs - lastToastAtRef.current < 15_000) return;

    if (health.status === "healthy" && previous !== "healthy") {
      if (!sawDegradedStateRef.current) return;
      toast.success("Connection restored", {
        description: "Gateway is reachable again.",
      });
      sawDegradedStateRef.current = false;
      lastToastAtRef.current = nowTs;
      return;
    }

    if (health.status === "checking" && previous === "healthy") {
      toast.message("Connection is unstable", {
        description: health.errorMessage || "Live gateway checks are reconnecting.",
      });
      lastToastAtRef.current = nowTs;
      return;
    }

    if (health.status === "unreachable") {
      toast.error("Gateway disconnected", {
        description: health.errorMessage || "OpenClaw is not responding right now.",
      });
      lastToastAtRef.current = nowTs;
    }
  }, [health.status, health.errorMessage]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="gateway-health-button"
          aria-label={`Connection status: ${config.label}`}
        >
          <div
            className={cn(
              "gateway-health-dot",
              config.pulse && "gateway-health-pulse"
            )}
            style={{
              backgroundColor: config.color,
              boxShadow: `0 0 0 0 ${config.color}60`,
            }}
            aria-hidden="true"
          />
          <span className="gateway-health-label">{config.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="gateway-health-tooltip">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
              Connection
            </span>
            <div
              className={cn(
                "gateway-health-dot-small",
                config.pulse && "gateway-health-pulse"
              )}
              style={{
                backgroundColor: config.color,
                boxShadow: `0 0 0 0 ${config.color}60`,
              }}
              aria-hidden="true"
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Status:</span>
              <span className="text-xs font-medium" style={{ color: config.color }}>
                {config.label}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Last Check:</span>
              <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                {formatTimestamp(health.lastCheck)}
              </span>
            </div>

            {health.retryCount > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>Retries:</span>
                <span className="text-xs font-mono" style={{ color: "var(--accent-warning)" }}>
                  {health.retryCount}
                </span>
              </div>
            )}

            {health.errorMessage && (
              <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
                <span className="text-xs" style={{ color: "var(--accent-error)" }}>
                  {health.errorMessage}
                </span>
              </div>
            )}
          </div>

          <div className="mt-1 pt-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
            <div className="text-xs" style={{ color: "var(--text-dim)" }}>
              <span className="font-mono">/api/system/stream</span>
              <span className="mx-1">·</span>
              <span>Live status feed</span>
            </div>
          </div>
        </div>
      </PopoverContent>

      <style jsx>{`
        .gateway-health-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          border-radius: 8px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .gateway-health-button:hover {
          background: var(--bg-surface);
          border-color: var(--border-default);
        }

        .gateway-health-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .gateway-health-dot-small {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .gateway-health-pulse {
          animation: gateway-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        @keyframes gateway-pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        .gateway-health-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary);
          white-space: nowrap;
        }

        .gateway-health-tooltip {
          min-width: 260px;
          padding: 12px;
        }
      `}</style>
    </Popover>
  );
});

export default GatewayHealthIndicator;
