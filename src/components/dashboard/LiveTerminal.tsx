"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SerializeAddon } from "@xterm/addon-serialize";
import "xterm/css/xterm.css";
import { toast } from "sonner";
import { useQuery } from "convex/react";
import { api } from "@/lib/convexApi";

export type LiveTerminalProps = {
  sessionId?: string;
  agentName?: string;
  /** Filter logs to only show lines containing this agent ID */
  agentFilter?: string;
};

function disposeTerminal(container: HTMLDivElement | null, terminal: Terminal | null) {
  try {
    terminal?.dispose();
  } catch {
    // ignore
  }

  if (container) container.innerHTML = "";
}

export function LiveTerminal({ sessionId, agentName, agentFilter }: LiveTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const serializeAddonRef = useRef<SerializeAddon | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return true;
    }

    try {
      const stored = localStorage.getItem("terminal-auto-scroll");
      if (!stored) return true;
      const parsed = JSON.parse(stored) as unknown;
      return typeof parsed === "boolean" ? parsed : true;
    } catch {
      return true;
    }
  });
  const autoScrollRef = useRef(autoScroll);
  const streamSetting = useQuery(api.settings.get, { key: "eventStreamEnabled" });
  const eventStreamEnabled =
    typeof streamSetting?.value === "boolean" ? streamSetting.value : true;
  const isAtBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  useEffect(() => {
    autoScrollRef.current = autoScroll;
  }, [autoScroll]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let initTimer: ReturnType<typeof setTimeout> | null = null;
    let localTerminal: Terminal | null = null;
    let localSerializeAddon: SerializeAddon | null = null;
    let localFitAddon: FitAddon | null = null;
    let localEventSource: EventSource | null = null;
    let localResizeObserver: ResizeObserver | null = null;
    let localScrollDisposable: { dispose: () => void } | null = null;
    let removeWindowResizeListener: (() => void) | null = null;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    let hasShownDisconnect = false;

    const safeCloseStream = () => {
      if (!localEventSource) return;
      try {
        localEventSource.close();
      } catch {
        // ignore close race
      }
      if (eventSourceRef.current === localEventSource) {
        eventSourceRef.current = null;
      }
      localEventSource = null;
    };

    const safeDisposeTerminal = () => {
      if (!localTerminal) return;
      disposeTerminal(container, localTerminal);
      if (terminalRef.current === localTerminal) {
        terminalRef.current = null;
      }
      if (serializeAddonRef.current === localSerializeAddon) {
        serializeAddonRef.current = null;
      }
      if (fitAddonRef.current === localFitAddon) {
        fitAddonRef.current = null;
      }
      localTerminal = null;
      localSerializeAddon = null;
      localFitAddon = null;
    };

    const safeScrollBottom = () => {
      if (!autoScrollRef.current || !localTerminal) return;
      if (!isAtBottomRef.current) {
        setShowJumpToLatest(true);
        return;
      }
      try {
        localTerminal.scrollToBottom();
      } catch {
        // ignore rendering race conditions during mount/unmount
      }
    };

    const writeAndScroll = (text: string) => {
      if (!localTerminal) return;
      try {
        localTerminal.write(text, safeScrollBottom);
      } catch {
        // xterm may throw while layout is still stabilizing
      }
    };

    const writeLineAndScroll = (text: string) => {
      if (!localTerminal) return;
      try {
        localTerminal.writeln(text);
        safeScrollBottom();
      } catch {
        // ignore rendering race conditions during mount/unmount
      }
    };

    const cleanup = () => {
      if (initTimer) {
        clearTimeout(initTimer);
        initTimer = null;
      }
      if (localResizeObserver) {
        try {
          localResizeObserver.disconnect();
        } catch {
          // ignore
        }
        localResizeObserver = null;
      }
      if (removeWindowResizeListener) {
        try {
          removeWindowResizeListener();
        } catch {
          // ignore
        }
        removeWindowResizeListener = null;
      }
      if (localScrollDisposable) {
        try {
          localScrollDisposable.dispose();
        } catch {
          // ignore
        }
        localScrollDisposable = null;
      }
      safeCloseStream();
      safeDisposeTerminal();
      setConnected(false);
      setShowJumpToLatest(false);
      isAtBottomRef.current = true;
    };

    if (!eventStreamEnabled) {
      cleanup();
      return cleanup;
    }

    initTimer = setTimeout(() => {
      if (cancelled) return;

      const terminal = new Terminal({
        theme: {
          background: "#0a0a0a",
          foreground: "#a1a1a1",
          cursor: "#ededed",
          cursorAccent: "#0a0a0a",
          selectionBackground: "rgba(0, 112, 243, 0.2)",
          black: "#0a0a0a",
          red: "#e5484d",
          green: "#46a758",
          yellow: "#f5a623",
          blue: "#0070f3",
          magenta: "#7c3aed",
          cyan: "#0070f3",
          white: "#ededed",
          brightBlack: "#555555",
          brightRed: "#e5484d",
          brightGreen: "#46a758",
          brightYellow: "#f5a623",
          brightBlue: "#0070f3",
          brightMagenta: "#7c3aed",
          brightCyan: "#0070f3",
          brightWhite: "#ffffff",
        },
        convertEol: true,
        cursorBlink: true,
        cursorStyle: "block",
        fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
        fontSize: 12,
        lineHeight: 1.4,
        scrollback: 8000,
        allowTransparency: true,
      });

      const serializeAddon = new SerializeAddon();
      const fitAddon = new FitAddon();
      terminal.loadAddon(serializeAddon);
      terminal.loadAddon(fitAddon);
      terminal.open(container);

      localTerminal = terminal;
      localSerializeAddon = serializeAddon;
      localFitAddon = fitAddon;
      terminalRef.current = terminal;
      serializeAddonRef.current = serializeAddon;
      fitAddonRef.current = fitAddon;

      const fitSafe = () => {
        try {
          fitAddon.fit();
          safeScrollBottom();
        } catch {
          // ignore
        }
      };

      // Fit once at mount time and keep the terminal sized to its container.
      fitSafe();
      if (typeof ResizeObserver !== "undefined") {
        localResizeObserver = new ResizeObserver(() => {
          fitSafe();
        });
        localResizeObserver.observe(container);
      } else {
        const onResize = () => {
          fitSafe();
        };
        window.addEventListener("resize", onResize);
        removeWindowResizeListener = () => {
          window.removeEventListener("resize", onResize);
        };
      }

      // Track if the user scrolls away from the latest output so we don't fight them.
      localScrollDisposable = terminal.onScroll(() => {
        try {
          const buf = terminal.buffer.active;
          const atBottom = buf.viewportY === buf.baseY;
          const wasAtBottom = isAtBottomRef.current;
          isAtBottomRef.current = atBottom;
          if (atBottom) {
            if (!wasAtBottom) setShowJumpToLatest(false);
          } else if (autoScrollRef.current) {
            setShowJumpToLatest(true);
          }
        } catch {
          // ignore
        }
      });

      const streamUrl = new URL("/api/openclaw/stream", window.location.origin);
      if (sessionId) {
        streamUrl.searchParams.set("session", sessionId);
      }
      if (agentFilter) {
        streamUrl.searchParams.set("agent", agentFilter);
      }

      const eventSource = new EventSource(streamUrl.toString());
      localEventSource = eventSource;
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        if (cancelled) return;
        retryCount = 0;
        hasShownDisconnect = false;
        writeLineAndScroll("\x1b[32m[Connected to log stream]\x1b[0m");
        setConnected(true);
      };

      eventSource.onmessage = (event) => {
        if (cancelled) return;
        try {
          const payload = JSON.parse(event.data) as {
            type?: "log" | "stderr" | "error";
            line?: string;
          };

          if (!payload.line || typeof payload.line !== "string") {
            return;
          }

          let rendered = payload.line;
          try {
            const maybeJson = JSON.parse(payload.line) as { message?: unknown };
            if (typeof maybeJson.message === "string" && maybeJson.message.trim()) {
              rendered = maybeJson.message;
            }
          } catch {
            // keep raw line
          }

          if (payload.type === "stderr" || payload.type === "error") {
            writeAndScroll(`\x1b[33m${rendered}\x1b[0m\n`);
            return;
          }

          writeAndScroll(`${rendered}\n`);
        } catch {
          writeAndScroll(`${event.data}\n`);
        }
      };

      eventSource.onerror = () => {
        if (cancelled) return;
        setConnected(false);
        retryCount += 1;

        if (!hasShownDisconnect) {
          hasShownDisconnect = true;
          writeLineAndScroll("");
          writeLineAndScroll("\x1b[33m[Stream disconnected — waiting for activity...]\x1b[0m");
        }

        if (retryCount >= MAX_RETRIES) {
          eventSource.close();
          writeLineAndScroll("\x1b[90m[Stream idle — will reconnect when agents are active]\x1b[0m");
        }
      };
    }, 0);

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [sessionId, agentFilter, eventStreamEnabled]);

  // Control handlers
  const handleClear = useCallback(() => {
    terminalRef.current?.clear();
    toast.success("Terminal cleared");
  }, []);

  const handleCopy = useCallback(() => {
    if (!serializeAddonRef.current) return;
    try {
      const content = serializeAddonRef.current.serialize();
      navigator.clipboard.writeText(content);
      toast.success("Terminal content copied to clipboard");
    } catch {
      toast.error("Failed to copy terminal content");
    }
  }, []);

  const handleExport = useCallback(() => {
    if (!serializeAddonRef.current) return;
    try {
      const content = serializeAddonRef.current.serialize();
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `terminal-log-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Terminal log exported");
    } catch {
      toast.error("Failed to export terminal log");
    }
  }, []);

  const handleToggleAutoScroll = useCallback(() => {
    setAutoScroll((prev) => {
      const next = !prev;
      localStorage.setItem("terminal-auto-scroll", JSON.stringify(next));
      toast.success(next ? "Auto-scroll enabled" : "Auto-scroll disabled");
      return next;
    });
  }, []);

  const terminalLabel = agentName || (agentFilter ? `Logs: ${agentFilter}` : "All Agents");

  return (
    <div
      className="terminal-panel"
      style={{
        background: "#0a0a0a",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: "1px solid rgba(34, 197, 94, 0.2)",
          background: "rgba(34, 197, 94, 0.05)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--terminal-text)",
          fontWeight: 600,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 9999,
              background: connected ? "var(--terminal-cursor)" : "var(--terminal-dim)",
              boxShadow: connected ? "0 0 8px rgba(0, 255, 0, 0.5)" : "none",
              animation: connected ? "pulse 1.5s infinite" : "none",
            }}
          />
          <span>{terminalLabel}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Control buttons */}
          <button
            onClick={handleToggleAutoScroll}
            title={autoScroll ? "Disable auto-scroll" : "Enable auto-scroll"}
            style={{
              background: autoScroll ? "rgba(34, 197, 94, 0.2)" : "transparent",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              color: "var(--terminal-text)",
              padding: "4px 8px",
              borderRadius: 4,
              fontSize: 10,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {autoScroll ? "⬇ AUTO" : "⬇ MANUAL"}
          </button>
          <button
            onClick={handleClear}
            title="Clear terminal"
            style={{
              background: "transparent",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              color: "var(--terminal-text)",
              padding: "4px 8px",
              borderRadius: 4,
              fontSize: 10,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            CLEAR
          </button>
          <button
            onClick={handleCopy}
            title="Copy terminal content"
            style={{
              background: "transparent",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              color: "var(--terminal-text)",
              padding: "4px 8px",
              borderRadius: 4,
              fontSize: 10,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            COPY
          </button>
          <button
            onClick={handleExport}
            title="Export terminal log"
            style={{
              background: "transparent",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              color: "var(--terminal-text)",
              padding: "4px 8px",
              borderRadius: 4,
              fontSize: 10,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            EXPORT
          </button>

          {!eventStreamEnabled ? (
            <span style={{ color: "var(--terminal-dim)", marginLeft: 8 }}>
              ○ DISABLED
            </span>
          ) : connected ? (
            <span style={{ color: "var(--terminal-cursor)", letterSpacing: "0.15em", marginLeft: 8 }}>
              ● LIVE
            </span>
          ) : (
            <span style={{ color: "var(--terminal-dim)", marginLeft: 8 }}>
              ○ IDLE
            </span>
          )}
        </div>
      </div>

      {!eventStreamEnabled ? (
        <div
          className="terminal-idle-state"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 24,
            background: "#0a0a0a",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Scanline effect */}
          <div
            className="terminal-scanlines"
            style={{
              position: "absolute",
              inset: 0,
              background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34, 197, 94, 0.02) 2px, rgba(34, 197, 94, 0.02) 4px)",
              pointerEvents: "none",
            }}
          />
          {/* Grid effect */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(circle at center, rgba(34, 197, 94, 0.08) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />
          {/* Idle indicator */}
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "var(--radius-lg)",
              background: "rgba(34, 197, 94, 0.1)",
              border: "1px solid rgba(34, 197, 94, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              position: "relative",
            }}
          >
            <span style={{ opacity: 0.6, color: "var(--terminal-text)" }}>▸</span>
          </div>
          <div style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "var(--terminal-dim)",
                marginBottom: 6,
              }}
            >
              STREAM DISABLED
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--terminal-text)", opacity: 0.7 }}>
              Enable live event stream in Settings → System.
            </div>
          </div>
          {/* Blinking cursor effect */}
          <div
            style={{
              width: 10,
              height: 16,
              background: "var(--terminal-cursor)",
              animation: "cursor-blink 1s step-end infinite",
              boxShadow: "0 0 8px rgba(0, 255, 0, 0.5)",
            }}
          />
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            background: "#0a0a0a",
            padding: 10,
            position: "relative",
          }}
        >
          <div
            ref={containerRef}
            style={{
              width: "100%",
              height: "100%",
              minHeight: 0,
            }}
          />
          {autoScroll && showJumpToLatest && (
            <button
              type="button"
              onClick={() => {
                try {
                  terminalRef.current?.scrollToBottom();
                } finally {
                  isAtBottomRef.current = true;
                  setShowJumpToLatest(false);
                }
              }}
              style={{
                position: "absolute",
                right: 12,
                bottom: 12,
                border: "1px solid rgba(34, 197, 94, 0.3)",
                background: "rgba(0, 0, 0, 0.55)",
                color: "var(--terminal-text)",
                padding: "6px 10px",
                borderRadius: 9999,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                cursor: "pointer",
                backdropFilter: "blur(10px)",
              }}
              title="Scroll to latest output"
            >
              Jump to latest
            </button>
          )}
        </div>
      )}
    </div>
  );
}
