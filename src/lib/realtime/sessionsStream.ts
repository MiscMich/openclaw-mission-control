import { watch, type FSWatcher } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { listSessions } from "@/lib/openclaw/client";
import type { SessionInfo } from "@/lib/openclaw/types";
import { getDefaultAgentsDir, getOpenClawHomeDir } from "@/lib/openclaw/paths";

type SessionsSuccessPayload = {
  ok: true;
  sessions: SessionInfo[];
  checkedAt: number;
  source: string;
};

type SessionsErrorPayload = {
  ok: false;
  error: string;
  checkedAt: number;
  source: string;
};

export type SessionsStreamPayload = SessionsSuccessPayload | SessionsErrorPayload;

type SessionsStreamListener = (payload: SessionsStreamPayload) => void;

type SessionsStreamState = {
  initialized: boolean;
  refreshing: boolean;
  queued: boolean;
  refreshTimer: NodeJS.Timeout | null;
  listeners: Set<SessionsStreamListener>;
  watchers: FSWatcher[];
  lastPayload: SessionsStreamPayload | null;
  lastSignature: string | null;
};

declare global {
  var __missionControlSessionsStreamState: SessionsStreamState | undefined;
}

function createState(): SessionsStreamState {
  return {
    initialized: false,
    refreshing: false,
    queued: false,
    refreshTimer: null,
    listeners: new Set<SessionsStreamListener>(),
    watchers: [],
    lastPayload: null,
    lastSignature: null,
  };
}

const state =
  globalThis.__missionControlSessionsStreamState ??
  (globalThis.__missionControlSessionsStreamState = createState());

function encodeSignature(sessions: SessionInfo[]): string {
  return sessions
    .map((session) =>
      [
        session.key,
        session.status ?? "",
        session.updatedAt ?? 0,
        session.totalTokens ?? 0,
        session.inputTokens ?? 0,
        session.outputTokens ?? 0,
      ].join("|")
    )
    .join("::");
}

function emit(payload: SessionsStreamPayload) {
  state.lastPayload = payload;
  for (const listener of state.listeners) {
    try {
      listener(payload);
    } catch {
      // Prevent a single broken listener from taking down the stream.
    }
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function shouldTriggerFromFilename(filename?: string | Buffer | null): boolean {
  if (!filename) return true;
  const normalized = String(filename).toLowerCase();
  return (
    normalized.includes("sessions") ||
    normalized.endsWith(".json") ||
    normalized.endsWith(".jsonl")
  );
}

async function refreshSessions(source: string) {
  if (state.refreshing) {
    state.queued = true;
    return;
  }

  state.refreshing = true;
  try {
    const sessions = await listSessions();
    const signature = encodeSignature(sessions);
    if (signature !== state.lastSignature || source === "subscribe") {
      state.lastSignature = signature;
      emit({
        ok: true,
        sessions,
        checkedAt: Date.now(),
        source,
      });
    }
  } catch (error) {
    emit({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load sessions",
      checkedAt: Date.now(),
      source,
    });
  } finally {
    state.refreshing = false;
    if (state.queued) {
      state.queued = false;
      queueRefresh(`${source}:queued`, 0);
    }
  }
}

function queueRefresh(source: string, delayMs = 120) {
  if (state.refreshTimer) {
    clearTimeout(state.refreshTimer);
  }
  state.refreshTimer = setTimeout(() => {
    state.refreshTimer = null;
    void refreshSessions(source);
  }, delayMs);
}

function addWatcher(target: string) {
  const watcher = watch(
    target,
    { recursive: true },
    (_eventType, filename) => {
      if (!shouldTriggerFromFilename(filename)) return;
      queueRefresh("fs-watch");
    }
  );

  watcher.on("error", () => {
    // Watch errors are non-fatal; fallback refreshes still happen on connects/actions.
  });

  state.watchers.push(watcher);
}

async function initialize() {
  if (state.initialized) return;
  state.initialized = true;

  const targets = [
    getDefaultAgentsDir(),
    path.join(getOpenClawHomeDir(), "sessions"),
  ];

  for (const target of targets) {
    if (!(await pathExists(target))) continue;
    try {
      addWatcher(target);
    } catch {
      // Continue when recursive watch is unsupported for a path.
    }
  }
}

export async function subscribeSessionsStream(
  listener: SessionsStreamListener
): Promise<() => void> {
  await initialize();
  state.listeners.add(listener);

  if (state.lastPayload) {
    listener(state.lastPayload);
  } else {
    queueRefresh("subscribe", 0);
  }

  return () => {
    state.listeners.delete(listener);
  };
}

export async function triggerSessionsStreamRefresh(source = "manual") {
  await initialize();
  queueRefresh(source, 0);
}
