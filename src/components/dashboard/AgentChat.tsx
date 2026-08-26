"use client";

import { memo, useState, useRef, useEffect, useMemo, useDeferredValue, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convexApi";
import { TimeAgo } from "@/components/ui/TimeAgo";
import { MappedIcon } from "@/components/ui";
import { AgentAvatar } from "@/components/ui/AgentAvatar";
import { toast } from "sonner";
import { canonicalAgentId, openClawAgentStoreId } from "@/lib/agents/identity";
import { useSessionsStream } from "@/hooks/useSessionsStream";

type ChatViewMode = "all" | "broadcast" | "thread";
type ThreadTranscriptSource = "convex" | "gateway";

interface AgentChatProps {
  currentAgentId?: string; // The agent "perspective" for filtering
  taskId?: string; // Optional: scope to a specific task
  initialViewMode?: ChatViewMode;
  focusMessageId?: string;
}

const OPERATOR_ID = "operator";

type ChatAttachment = {
  name: string;
  path?: string;
  url?: string;
  size?: number;
  mimeType?: string;
};

type PendingAttachment = ChatAttachment & {
  id: string;
  status: "uploading" | "ready" | "error";
  error?: string;
};

type ThreadSessionOption = {
  key: string;
  updatedAt: number;
  label: string;
};

type GatewayHistoryMessage = {
  role: string;
  content: unknown;
  timestamp?: number;
};

type GatewayImage = {
  mimeType: string;
  data: string;
};

type RenderableChatMessage = {
  id: string;
  fromAgentId: string;
  toAgentId?: string;
  content: string;
  createdAt: number;
  taskId?: string;
  attachments?: ChatAttachment[];
  gatewayImages?: GatewayImage[];
};

type ExternalDeliveryChannel = "telegram" | "signal" | "whatsapp";

function sanitizeAttachmentName(name: string) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fileNameFromValue(value: string) {
  const segments = value.split(/[/?#]/).filter(Boolean);
  return segments[segments.length - 1] ?? value;
}

function resolveAttachmentHref(attachment: ChatAttachment) {
  if (attachment.url) {
    return attachment.url;
  }
  if (attachment.path) {
    return `/api/openclaw/file?path=${encodeURIComponent(attachment.path)}&raw=true`;
  }
  return null;
}

function normalizeAttachments(value: unknown): ChatAttachment[] {
  if (!Array.isArray(value)) return [];

  const normalized: ChatAttachment[] = [];

  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      const rawValue = item.trim();
      const isUrl = /^https?:\/\//i.test(rawValue);
      normalized.push({
        name: fileNameFromValue(rawValue),
        path: isUrl ? undefined : rawValue,
        url: isUrl ? rawValue : undefined,
      });
      continue;
    }

    if (item && typeof item === "object") {
      const candidate = item as Record<string, unknown>;
      const name = typeof candidate.name === "string" ? candidate.name : undefined;
      const path = typeof candidate.path === "string" ? candidate.path : undefined;
      const url = typeof candidate.url === "string" ? candidate.url : undefined;
      const size = typeof candidate.size === "number" ? candidate.size : undefined;
      const mimeType =
        typeof candidate.mimeType === "string"
          ? candidate.mimeType
          : typeof candidate.type === "string"
            ? candidate.type
            : undefined;

      const resolvedName =
        name ?? (path ? fileNameFromValue(path) : undefined) ?? (url ? fileNameFromValue(url) : undefined);

      if (!resolvedName && !path && !url) {
        continue;
      }

      normalized.push({
        name: resolvedName ?? "attachment",
        path,
        url,
        size,
        mimeType,
      });
    }
  }

  return normalized;
}

function formatAttachmentSize(size?: number) {
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    return "";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  const kb = size / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  }

  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
  }

  const gb = mb / 1024;
  return `${gb.toFixed(gb >= 100 ? 0 : 1)} GB`;
}

function safeJsonString(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value ?? "");
  }
}

function truncateString(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)} ...[truncated]`;
}

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

function contentBlockToImage(block: unknown): GatewayImage | null {
  if (!block || typeof block !== "object") return null;
  const candidate = block as Record<string, unknown>;
  if (candidate.type !== "image") return null;
  const mimeType = typeof candidate.mimeType === "string" ? candidate.mimeType.trim() : "";
  const data = typeof candidate.data === "string" ? candidate.data.trim() : "";
  if (!mimeType || !data) return null;
  return { mimeType, data };
}

function normalizeGatewayContent(content: unknown): { text: string; images: GatewayImage[] } {
  if (typeof content === "string") return { text: content, images: [] };
  if (!Array.isArray(content)) return { text: "", images: [] };

  const parts: string[] = [];
  const images: GatewayImage[] = [];

  for (const block of content) {
    const text = contentBlockToText(block);
    if (text) {
      parts.push(text);
    }
    const img = contentBlockToImage(block);
    if (img) {
      images.push(img);
    }
  }

  return { text: parts.join("\n\n"), images };
}

function normalizeGatewayMessageText(content: unknown): string {
  const normalized = normalizeGatewayContent(content);
  return normalized.text;
}

function inferExternalDeliveryChannel(
  sessionKey: string
): ExternalDeliveryChannel | null {
  const normalized = sessionKey.toLowerCase();
  if (normalized.includes(":telegram:")) return "telegram";
  if (normalized.includes(":signal:")) return "signal";
  if (normalized.includes(":whatsapp:")) return "whatsapp";
  return null;
}

function threadSessionSortPriority(prefix: string, option: ThreadSessionOption): number {
  const keyLower = option.key.toLowerCase();
  const mainKeyLower = `${prefix}main`.toLowerCase();
  if (keyLower === mainKeyLower) return 0;

  if (inferExternalDeliveryChannel(option.key) !== null) return 2;
  if (keyLower.includes(":cron:")) return 3;
  return 1;
}

function formatExternalDeliveryChannel(channel: ExternalDeliveryChannel): string {
  switch (channel) {
    case "telegram":
      return "Telegram";
    case "signal":
      return "Signal";
    case "whatsapp":
      return "WhatsApp";
  }
}

export const AgentChat = memo(function AgentChat({
  currentAgentId,
  taskId,
  initialViewMode,
  focusMessageId,
}: AgentChatProps) {
  const actorAgentId = OPERATOR_ID;
  const agents = useQuery(api.agents.list, {});
  const normalizedAgents = useMemo(() => {
    if (!agents) return undefined;
    const order: string[] = [];
    const byCanonical = new Map<string, (typeof agents)[number]>();

    for (const agent of agents) {
      const canonicalId = canonicalAgentId(agent.id);
      const existing = byCanonical.get(canonicalId);
      if (!existing) {
        order.push(canonicalId);
        byCanonical.set(canonicalId, agent);
        continue;
      }

      const existingLastSeen = existing.lastSeen ?? 0;
      const incomingLastSeen = agent.lastSeen ?? 0;
      if (incomingLastSeen > existingLastSeen) {
        byCanonical.set(canonicalId, agent);
      }
    }

    return order
      .map((id) => byCanonical.get(id))
      .filter((agent): agent is (typeof agents)[number] => Boolean(agent));
  }, [agents]);
  const [viewMode, setViewMode] = useState<ChatViewMode>(() => initialViewMode ?? "all");
  const [threadAgentId, setThreadAgentId] = useState<string>("");
  const [threadSessionKey, setThreadSessionKey] = useState<string>("");
  const isThreadView = viewMode === "thread";
  const shouldScopeThreadMessagesBySession = isThreadView && Boolean(threadSessionKey);
  const isExternalThread =
    isThreadView &&
    Boolean(threadSessionKey) &&
    inferExternalDeliveryChannel(threadSessionKey) !== null;
  const messages = useQuery(api.agentMessages.list, {
    limit: 150,
    agentId: viewMode === "thread" ? actorAgentId : currentAgentId,
    sessionKey: shouldScopeThreadMessagesBySession ? threadSessionKey : undefined,
  });
  const { sessions } = useSessionsStream();

  const [content, setContent] = useState("");
  const [toAgentId, setToAgentId] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const sendInFlightRef = useRef(false);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const deferredMessageSearch = useDeferredValue(messageSearch);
  const [deliverExternally, setDeliverExternally] = useState(false);
  const [threadTranscriptSource, setThreadTranscriptSource] =
    useState<ThreadTranscriptSource>("convex");
  const [threadHistory, setThreadHistory] = useState<GatewayHistoryMessage[] | null>(null);
  const [threadHistoryLoading, setThreadHistoryLoading] = useState(false);
  const [threadHistoryError, setThreadHistoryError] = useState<string | null>(null);
  const [threadHistoryCached, setThreadHistoryCached] = useState<boolean | null>(null);
  const [syncingThread, setSyncingThread] = useState(false);
  const chatStreamRef = useRef<EventSource | null>(null);
  const [activeGatewayRunId, setActiveGatewayRunId] = useState<string | null>(null);
  const [activeGatewayRunStartedAt, setActiveGatewayRunStartedAt] = useState<number | null>(null);
  const [activeGatewayRunText, setActiveGatewayRunText] = useState<string>("");
  const [activeGatewayRunState, setActiveGatewayRunState] = useState<
    "idle" | "connecting" | "streaming" | "final" | "aborted" | "error"
  >("idle");
  const [activeGatewayRunError, setActiveGatewayRunError] = useState<string | null>(null);
  const [activeGatewayToolEvents, setActiveGatewayToolEvents] = useState<
    Array<{ runId: string; seq: number; ts: number; stream: string; data: unknown }>
  >([]);
  const [showToolEvents, setShowToolEvents] = useState(false);
  const [optimisticGatewayMessage, setOptimisticGatewayMessage] = useState<{
    id: string;
    createdAt: number;
    content: string;
    attachments?: ChatAttachment[];
  } | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastFocusedMessageIdRef = useRef<string | null>(null);
  const threadHistoryInFlightRef = useRef(false);
  const threadHistoryAbortRef = useRef<AbortController | null>(null);
  const threadSessionKeyRef = useRef<string>("");

  const agentsById = useMemo(() => {
    const map = new Map<string, { name: string; id: string }>();
    if (!normalizedAgents) return map;
    for (const agent of normalizedAgents) {
      map.set(agent.id, { name: agent.name, id: agent.id });
    }
    return map;
  }, [normalizedAgents]);

  const filteredAgents = useMemo(() => {
    if (!normalizedAgents) return [];
    if (!mentionFilter) return normalizedAgents;
    const lower = mentionFilter.toLowerCase();
    return normalizedAgents.filter(
      (a) =>
        a.name.toLowerCase().includes(lower) ||
        a.id.toLowerCase().includes(lower)
    );
  }, [normalizedAgents, mentionFilter]);

  const threadableAgents = useMemo(() => {
    if (!normalizedAgents) return [];
    return normalizedAgents.filter((agent) => agent.id !== actorAgentId);
  }, [normalizedAgents, actorAgentId]);

  const sidebarAgents = useMemo(() => {
    if (!threadableAgents.length) return [];
    const query = sidebarSearch.trim().toLowerCase();
    if (!query) return threadableAgents;
    return threadableAgents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(query) ||
        agent.id.toLowerCase().includes(query)
    );
  }, [threadableAgents, sidebarSearch]);

  const threadSessionOptions = useMemo<ThreadSessionOption[]>(() => {
    if (!threadAgentId) return [];
    const canonicalThreadAgentId = canonicalAgentId(threadAgentId);
    const storeAgentId = openClawAgentStoreId(canonicalThreadAgentId);
    const prefix = `agent:${storeAgentId}:`;

    const discovered = sessions
      .filter((session) => typeof session.key === "string" && session.key.startsWith(prefix))
      .map((session) => {
        const key = session.key as string;
        const updatedAt = session.updatedAt ?? session.lastActivity ?? Date.now();
        const suffix = key.slice(prefix.length) || "main";
        return {
          key,
          updatedAt,
          label: suffix,
        };
      });

    const byKey = new Map<string, ThreadSessionOption>();
    for (const option of discovered) {
      byKey.set(option.key, option);
    }

    // Always include the default main session even when the gateway isn't reporting it as active.
    const defaultKey = `${prefix}main`;
    if (!byKey.has(defaultKey)) {
      byKey.set(defaultKey, { key: defaultKey, updatedAt: 0, label: "main" });
    }

    return [...byKey.values()].sort((a, b) => {
      const priorityA = threadSessionSortPriority(prefix, a);
      const priorityB = threadSessionSortPriority(prefix, b);
      if (priorityA !== priorityB) return priorityA - priorityB;
      return b.updatedAt - a.updatedAt;
    });
  }, [sessions, threadAgentId]);

  const gatewayThreadMessages = useMemo<RenderableChatMessage[]>(() => {
    if (!threadHistory) return [];

    return threadHistory
      .map((message, index) => {
        const normalized = normalizeGatewayContent(message.content);
        const normalizedText = normalized.text.trim();
        const images = normalized.images;
        if (!normalizedText && images.length === 0) return null;
        const isUser = message.role === "user";
        const createdAt = message.timestamp ?? Date.now();
        return {
          id: `${threadSessionKey || "session"}-${createdAt}-${index}`,
          fromAgentId: isUser ? actorAgentId : threadAgentId,
          toAgentId: isUser ? threadAgentId : actorAgentId,
          content: normalizedText,
          createdAt,
          taskId: undefined,
          gatewayImages: images.length > 0 ? images : undefined,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [actorAgentId, threadAgentId, threadHistory, threadSessionKey]);

  const displayedMessages = useMemo<RenderableChatMessage[]>(() => {
    if (
      viewMode === "thread" &&
      threadSessionKey &&
      threadTranscriptSource === "gateway"
    ) {
      const base = [...gatewayThreadMessages];

      if (optimisticGatewayMessage) {
        const optimisticText = optimisticGatewayMessage.content.trim();
        const optimisticCreatedAt = optimisticGatewayMessage.createdAt;
        const matchWindowMs = 3_000;
        const hasMatch = base
          .slice(-8)
          .some(
            (msg) =>
              msg.fromAgentId === actorAgentId &&
              msg.toAgentId === threadAgentId &&
              msg.content.trim() === optimisticText &&
              Math.abs(msg.createdAt - optimisticCreatedAt) <= matchWindowMs
          );

        if (!hasMatch) {
          base.push({
            id: optimisticGatewayMessage.id,
            fromAgentId: actorAgentId,
            toAgentId: threadAgentId,
            content: optimisticGatewayMessage.content,
            createdAt: optimisticGatewayMessage.createdAt,
            taskId: undefined,
            attachments: optimisticGatewayMessage.attachments,
          });
        }
      }

      if (activeGatewayRunId && activeGatewayRunState !== "idle") {
        const indicator =
          activeGatewayRunText.trim() ||
          (activeGatewayRunState === "connecting"
            ? "..."
            : activeGatewayRunState === "aborted"
              ? "[aborted]"
              : activeGatewayRunState === "error"
                ? `[error] ${activeGatewayRunError ?? ""}`.trim()
                : "");

        if (indicator) {
          base.push({
            id: `gateway-run-${activeGatewayRunId}`,
            fromAgentId: threadAgentId,
            toAgentId: actorAgentId,
            content: indicator,
            createdAt: activeGatewayRunStartedAt ?? Date.now(),
            taskId: undefined,
            attachments: undefined,
          });
        }
      }

      return base;
    }

    const source = (messages ?? []) as unknown as RenderableChatMessage[];

    if (viewMode === "broadcast") {
      return source.filter((msg) => !msg.toAgentId);
    }

    if (viewMode === "thread") {
      if (!threadAgentId) return [];
      return source.filter(
        (msg) =>
          (msg.fromAgentId === actorAgentId && msg.toAgentId === threadAgentId) ||
          (msg.fromAgentId === threadAgentId && msg.toAgentId === actorAgentId)
      );
    }

    return source;
  }, [
    messages,
    viewMode,
    threadAgentId,
    actorAgentId,
    gatewayThreadMessages,
    threadSessionKey,
    isExternalThread,
    threadTranscriptSource,
    optimisticGatewayMessage,
    activeGatewayRunId,
    activeGatewayRunState,
    activeGatewayRunText,
    activeGatewayRunError,
    activeGatewayRunStartedAt,
  ]);

  const searchedMessages = useMemo(() => {
    const q = deferredMessageSearch.trim().toLowerCase();
    if (!q) return displayedMessages;

    return displayedMessages.filter((msg) => {
      const haystack = `${msg.fromAgentId} ${msg.toAgentId ?? ""} ${msg.taskId ?? ""} ${msg.content ?? ""}`.toLowerCase();
      if (haystack.includes(q)) return true;
      const attachments = normalizeAttachments((msg as { attachments?: unknown }).attachments);
      return attachments.some((att) => att.name.toLowerCase().includes(q));
    });
  }, [deferredMessageSearch, displayedMessages]);

  const threadTargetName = useMemo(() => {
    if (!threadAgentId) return "agent";
    return agentsById.get(threadAgentId)?.name ?? threadAgentId;
  }, [agentsById, threadAgentId]);

  const selectedThreadSession = useMemo(() => {
    if (!threadSessionKey) return null;
    return threadSessionOptions.find((option) => option.key === threadSessionKey) ?? null;
  }, [threadSessionKey, threadSessionOptions]);

  const externalDeliveryChannel = useMemo(() => {
    if (!threadSessionKey) return null;
    return inferExternalDeliveryChannel(threadSessionKey);
  }, [threadSessionKey]);

  const uploadingAttachmentCount = useMemo(
    () => pendingAttachments.filter((item) => item.status === "uploading").length,
    [pendingAttachments]
  );

  const hasAttachmentErrors = useMemo(
    () => pendingAttachments.some((item) => item.status === "error"),
    [pendingAttachments]
  );

  const attachmentsForPayload = useMemo(
    () =>
      pendingAttachments
        .filter((item) => item.status === "ready")
        .flatMap(({ name, path, size, mimeType }) =>
          path
            ? [
                {
                  name,
                  path,
                  ...(typeof size === "number" ? { size } : {}),
                  ...(mimeType ? { mimeType } : {}),
                },
              ]
            : []
        ),
    [pendingAttachments]
  );

  const scrollMessagesToBottom = (opts?: { behavior?: ScrollBehavior }) => {
    const container = messagesContainerRef.current;
    if (!container) return;
    try {
      if (typeof container.scrollTo === "function") {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: opts?.behavior ?? "auto",
        });
      } else {
        container.scrollTop = container.scrollHeight;
      }
    } catch {
      container.scrollTop = container.scrollHeight;
    }
    isAtBottomRef.current = true;
    setShowJumpToLatest(false);
  };

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const thresholdPx = 140;
    const distanceToBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const atBottom = distanceToBottom <= thresholdPx;
    isAtBottomRef.current = atBottom;
    if (atBottom) {
      setShowJumpToLatest(false);
    }
  };

  // Auto-scroll to bottom, but only if the user is already near the bottom.
  // Avoid smooth scrolling: streaming deltas would trigger a constant animation.
  useEffect(() => {
    if (focusMessageId) return;
    if (isAtBottomRef.current) {
      scrollMessagesToBottom();
      return;
    }
    if (displayedMessages.length > 0) {
      setShowJumpToLatest(true);
    }
  }, [displayedMessages.length, activeGatewayRunText, focusMessageId]);

  useEffect(() => {
    if (!focusMessageId) {
      lastFocusedMessageIdRef.current = null;
      return;
    }
    if (lastFocusedMessageIdRef.current === focusMessageId) return;
    const target = document.getElementById(`agent-message-${focusMessageId}`);
    if (!target) return;
    lastFocusedMessageIdRef.current = focusMessageId;
    target?.scrollIntoView({ behavior: "auto", block: "center" });
  }, [displayedMessages.length, focusMessageId]);

  useEffect(() => {
    if (!initialViewMode) return;
    if (currentAgentId && currentAgentId !== actorAgentId) return;
    setViewMode(initialViewMode);
  }, [actorAgentId, currentAgentId, initialViewMode]);

  useEffect(() => {
    if (!threadableAgents.length) {
      setThreadAgentId("");
      setThreadSessionKey("");
      return;
    }
    if (!threadAgentId || !threadableAgents.some((agent) => agent.id === threadAgentId)) {
      setThreadAgentId(threadableAgents[0].id);
    }
  }, [threadAgentId, threadableAgents]);

  useEffect(() => {
    if (currentAgentId && currentAgentId !== actorAgentId) {
      setViewMode("thread");
      setThreadAgentId(currentAgentId);
      setToAgentId(currentAgentId);
      return;
    }

    // Deep links (e.g., global search -> Comms tab) can request a specific view mode.
    // In those cases, do not auto-select the default thread.
    if (initialViewMode) {
      return;
    }

    const preferredAgent = threadableAgents.find((agent) => agent.id === "coordinator");
    if (preferredAgent) {
      setViewMode("thread");
      setThreadAgentId(preferredAgent.id);
      setToAgentId(preferredAgent.id);
      return;
    }
    setViewMode("all");
  }, [currentAgentId, actorAgentId, initialViewMode, threadableAgents]);

  useEffect(() => {
    if (threadSessionOptions.length === 0) {
      setThreadSessionKey("");
      setThreadHistory(null);
      setThreadHistoryCached(null);
      setThreadTranscriptSource("convex");
      return;
    }

    const hasSelection = threadSessionOptions.some((option) => option.key === threadSessionKey);
    const fallbackKey = threadSessionOptions[0]?.key ?? "";

    const canonicalThreadAgentId = threadAgentId ? canonicalAgentId(threadAgentId) : "";
    const storeAgentId = canonicalThreadAgentId ? openClawAgentStoreId(canonicalThreadAgentId) : "";
    const mainKey = storeAgentId ? `agent:${storeAgentId}:main` : "";
    const mainOption = mainKey
      ? threadSessionOptions.find((option) => option.key === mainKey)
      : undefined;

    if (!threadSessionKey || !hasSelection) {
      setThreadSessionKey(mainOption?.key ?? fallbackKey);
      return;
    }
  }, [threadSessionKey, threadSessionOptions, threadAgentId]);

  useEffect(() => {
    if (!threadSessionKey) {
      setDeliverExternally(false);
      return;
    }
    setDeliverExternally(externalDeliveryChannel !== null);
  }, [threadSessionKey, externalDeliveryChannel]);

  useEffect(() => {
    threadSessionKeyRef.current = threadSessionKey;
  }, [threadSessionKey]);

  useEffect(() => {
    // Reset any gateway transcript state when leaving thread view or changing sessions.
    try {
      chatStreamRef.current?.close();
    } catch {
      // ignore close race
    }
    chatStreamRef.current = null;
    setActiveGatewayRunId(null);
    setActiveGatewayRunStartedAt(null);
    setActiveGatewayRunText("");
    setActiveGatewayRunState("idle");
    setActiveGatewayRunError(null);
    setActiveGatewayToolEvents([]);
    setShowToolEvents(false);
    setOptimisticGatewayMessage(null);
    sendInFlightRef.current = false;
    setSyncingThread(false);

    if (viewMode !== "thread" || !threadSessionKey) {
      setThreadTranscriptSource("convex");
      setThreadHistory(null);
      setThreadHistoryCached(null);
      setThreadHistoryError(null);
      setThreadHistoryLoading(false);
      threadHistoryAbortRef.current?.abort();
      threadHistoryAbortRef.current = null;
      threadHistoryInFlightRef.current = false;
      return;
    }

    // Default to gateway transcript so we can stream responses + attachments.
    // Convex transcript remains available for "synced" history (ingest pipeline).
    setThreadTranscriptSource("gateway");
    setThreadHistory(null);
    setThreadHistoryCached(null);
    setThreadHistoryError(null);
    setThreadHistoryLoading(false);
    threadHistoryAbortRef.current?.abort();
    threadHistoryAbortRef.current = null;
    threadHistoryInFlightRef.current = false;

    void loadGatewayHistory({ switchView: false });
  }, [threadSessionKey, viewMode]);

  useEffect(() => {
    return () => {
      try {
        chatStreamRef.current?.close();
      } catch {
        // ignore
      }
      chatStreamRef.current = null;
    };
  }, []);

  const loadGatewayHistory = async (opts?: { switchView?: boolean }) => {
    if (viewMode !== "thread" || !threadSessionKey) return;
    if (threadHistoryInFlightRef.current) return;

    threadHistoryInFlightRef.current = true;
    const controller = new AbortController();
    threadHistoryAbortRef.current?.abort();
    threadHistoryAbortRef.current = controller;

    setThreadHistoryLoading(true);
    setThreadHistoryError(null);

    try {
      const url = `/api/openclaw/chat/history?sessionKey=${encodeURIComponent(
        threadSessionKey
      )}&limit=120`;
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            cached?: boolean;
            error?: string;
            messages?: GatewayHistoryMessage[];
          }
        | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.messages)) {
        throw new Error(payload?.error || "Failed to load session history");
      }

      setThreadHistory(payload.messages);
      setThreadHistoryCached(typeof payload.cached === "boolean" ? payload.cached : null);
      if (opts?.switchView !== false) {
        setThreadTranscriptSource("gateway");
      }
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "name" in error &&
        (error as { name?: string }).name === "AbortError"
      ) {
        return;
      }

      setThreadHistoryError(
        error instanceof Error ? error.message : "Failed to load session history"
      );
      if (opts?.switchView !== false) {
        setThreadTranscriptSource("gateway");
      }
    } finally {
      threadHistoryInFlightRef.current = false;
      setThreadHistoryLoading(false);
    }
  };

  const syncThreadToConvex = async () => {
    if (viewMode !== "thread" || !threadSessionKey) return;
    if (syncingThread) return;

    setSyncingThread(true);
    try {
      const response = await fetch("/api/openclaw/chat/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionKey: threadSessionKey,
          agentId: threadAgentId || undefined,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; insertedMessages?: number; skippedMessages?: number }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Failed to sync chat");
      }

      const inserted =
        typeof payload.insertedMessages === "number" && Number.isFinite(payload.insertedMessages)
          ? payload.insertedMessages
          : 0;

      toast.success("Synced", {
        description: inserted > 0 ? `Imported ${inserted} message(s)` : "No new messages",
        duration: 1500,
      });
    } catch (error) {
      toast.error("Sync failed", {
        description: error instanceof Error ? error.message : "Failed to sync chat",
      });
    } finally {
      setSyncingThread(false);
    }
  };

  const closeChatStream = (opts?: { resetState?: boolean }) => {
    try {
      chatStreamRef.current?.close();
    } catch {
      // ignore close race
    }
    chatStreamRef.current = null;

    if (opts?.resetState !== false) {
      setActiveGatewayRunId(null);
      setActiveGatewayRunStartedAt(null);
      setActiveGatewayRunText("");
      setActiveGatewayRunState("idle");
      setActiveGatewayRunError(null);
      setActiveGatewayToolEvents([]);
      setShowToolEvents(false);
    }
  };

  const startChatStream = (params: { sessionKey: string; runId: string }) => {
    if (typeof window === "undefined") return;
    if (typeof EventSource === "undefined") return;

    closeChatStream();

    const streamUrl = new URL("/api/openclaw/chat/stream", window.location.origin);
    streamUrl.searchParams.set("sessionKey", params.sessionKey);
    streamUrl.searchParams.set("runId", params.runId);
    streamUrl.searchParams.set("includeAgent", "1");

    const source = new EventSource(streamUrl.toString());
    chatStreamRef.current = source;

    setActiveGatewayRunId(params.runId);
    setActiveGatewayRunStartedAt(Date.now());
    setActiveGatewayRunText("");
    setActiveGatewayRunError(null);
    setActiveGatewayToolEvents([]);
    setShowToolEvents(false);
    setActiveGatewayRunState("connecting");

    source.onopen = () => {
      setActiveGatewayRunState((current) => (current === "connecting" ? "streaming" : current));
    };

    source.onmessage = (event) => {
      if (threadSessionKeyRef.current !== params.sessionKey) {
        return;
      }
      try {
        const envelope = JSON.parse(event.data) as {
          ok?: boolean;
          event?: string;
          payload?: unknown;
        };
        if (!envelope?.ok) {
          return;
        }

        if (envelope.event === "chat") {
          const payload = envelope.payload as
            | {
                runId?: unknown;
                sessionKey?: unknown;
                state?: unknown;
                message?: unknown;
                errorMessage?: unknown;
              }
            | undefined;
          if (!payload || payload.sessionKey !== params.sessionKey || payload.runId !== params.runId) {
            return;
          }

          const state = typeof payload.state === "string" ? payload.state : "";
          if (state === "delta" || state === "final") {
            const message = payload.message as { content?: unknown } | undefined;
            const normalized = normalizeGatewayContent(message?.content);
            setActiveGatewayRunText(normalized.text);
          }

          if (state === "final") {
            setActiveGatewayRunState("final");
            closeChatStream({ resetState: false });
            if (threadSessionKeyRef.current === params.sessionKey) {
              void loadGatewayHistory({ switchView: false }).finally(() => {
                setOptimisticGatewayMessage(null);
                closeChatStream();
              });
            } else {
              closeChatStream();
            }
            return;
          }

          if (state === "aborted") {
            setActiveGatewayRunState("aborted");
            closeChatStream({ resetState: false });
            if (threadSessionKeyRef.current === params.sessionKey) {
              void loadGatewayHistory({ switchView: false }).finally(() => {
                setOptimisticGatewayMessage(null);
                closeChatStream();
              });
            } else {
              closeChatStream();
            }
            return;
          }

          if (state === "error") {
            const errorMessage =
              typeof payload.errorMessage === "string" && payload.errorMessage.trim()
                ? payload.errorMessage.trim()
                : "Run failed";
            setActiveGatewayRunError(errorMessage);
            setActiveGatewayRunState("error");
            closeChatStream({ resetState: false });
            if (threadSessionKeyRef.current === params.sessionKey) {
              void loadGatewayHistory({ switchView: false }).finally(() => {
                setOptimisticGatewayMessage(null);
                closeChatStream();
              });
            } else {
              closeChatStream();
            }
            return;
          }

          return;
        }

        if (envelope.event === "agent") {
          const payload = envelope.payload as
            | {
                runId?: unknown;
                seq?: unknown;
                stream?: unknown;
                ts?: unknown;
                data?: unknown;
              }
            | undefined;
          if (!payload) return;
          const runId = typeof payload.runId === "string" ? payload.runId : "";
          const seq = typeof payload.seq === "number" && Number.isFinite(payload.seq) ? payload.seq : 0;
          const stream = typeof payload.stream === "string" ? payload.stream : "";
          const ts = typeof payload.ts === "number" && Number.isFinite(payload.ts) ? payload.ts : Date.now();
          if (!runId || !stream) return;
          if (stream !== "tool") return;

          setActiveGatewayToolEvents((current) => {
            const next = [...current, { runId, seq, stream, ts, data: payload.data }];
            return next.length > 30 ? next.slice(-30) : next;
          });
        }
      } catch {
        // Ignore parse errors.
      }
    };

    source.onerror = () => {
      setActiveGatewayRunError("Gateway stream disconnected");
      setActiveGatewayRunState("error");
      closeChatStream({ resetState: false });
      if (threadSessionKeyRef.current === params.sessionKey) {
        void loadGatewayHistory({ switchView: false }).finally(() => {
          setOptimisticGatewayMessage(null);
          closeChatStream();
        });
      } else {
        closeChatStream();
      }
    };
  };

  const removeAttachment = (attachmentId: string) => {
    setPendingAttachments((current) => current.filter((item) => item.id !== attachmentId));
  };

  const handleAttachmentSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const selectedFiles = Array.from(files);
    const batchId = Date.now();
    const datePrefix = new Date(batchId).toISOString().slice(0, 10);

    const uploadJobs = selectedFiles.map((file, index) => {
      const id = `${batchId}-${index}-${Math.random().toString(36).slice(2, 9)}`;
      const safeName = sanitizeAttachmentName(file.name || `attachment-${index + 1}`);
      const uploadPath = `chat-attachments/${datePrefix}/${batchId}-${index}-${safeName}`;
      return { id, file, uploadPath };
    });

    setPendingAttachments((current) => [
      ...current,
      ...uploadJobs.map((job) => ({
        id: job.id,
        name: job.file.name || `attachment-${job.id}`,
        path: job.uploadPath,
        size: job.file.size,
        mimeType: job.file.type || undefined,
        status: "uploading" as const,
      })),
    ]);

    await Promise.all(
      uploadJobs.map(async (job) => {
        try {
          const formData = new FormData();
          formData.set("path", job.uploadPath);
          formData.set("type", "file");
          formData.set("file", job.file, job.file.name);

          const response = await fetch("/api/openclaw/file", {
            method: "POST",
            body: formData,
          });

          const payload = (await response.json().catch(() => null)) as
            | {
                ok?: boolean;
                error?: string;
                path?: string;
              }
            | null;

          if (!response.ok || !payload?.ok) {
            throw new Error(payload?.error || `Failed to upload ${job.file.name}`);
          }

          const uploadedPath =
            typeof payload.path === "string" && payload.path.trim() ? payload.path : job.uploadPath;

          setPendingAttachments((current) =>
            current.map((item) =>
              item.id === job.id
                ? {
                    ...item,
                    status: "ready",
                    path: uploadedPath,
                    error: undefined,
                  }
                : item
            )
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : `Failed to upload ${job.file.name}`;

          setPendingAttachments((current) =>
            current.map((item) =>
              item.id === job.id
                ? {
                    ...item,
                    status: "error",
                    error: message,
                  }
                : item
            )
          );

          toast.error(`Attachment upload failed: ${job.file.name}`, {
            description: message,
          });
        }
      })
    );
  };

  const handleSend = async () => {
    const trimmedContent = content.trim();
    const hasReadyAttachments = attachmentsForPayload.length > 0;
    if (
      (!trimmedContent && !hasReadyAttachments) ||
      sendInFlightRef.current ||
      sending ||
      uploadingAttachmentCount > 0
    ) {
      return;
    }
    if (
      viewMode === "thread" &&
      activeGatewayRunId &&
      (activeGatewayRunState === "connecting" || activeGatewayRunState === "streaming")
    ) {
      return;
    }
    if (hasAttachmentErrors) {
      toast.error("Remove failed attachments before sending");
      return;
    }
    const resolvedTarget = viewMode === "thread" ? threadAgentId || undefined : toAgentId;

    if (viewMode === "thread" && !resolvedTarget) {
      return;
    }

    sendInFlightRef.current = true;
    setSending(true);

    try {
      const isThreadSend = viewMode === "thread" && Boolean(threadSessionKey);

      // For session chat, store the same payload that the gateway will see so the
      // external ingest path can dedupe correctly (and so Comms can render immediately).
      const nonImageAttachments = attachmentsForPayload.filter((attachment) => {
        const mimeType = attachment.mimeType?.toLowerCase().trim() ?? "";
        if (!mimeType) return true;
        return !mimeType.startsWith("image/");
      });
      const attachmentSummary =
        nonImageAttachments.length > 0
          ? nonImageAttachments
              .map((attachment) => `- ${attachment.name} (${attachment.path})`)
              .join("\n")
          : "";
      const gatewayMessage = [
        trimmedContent,
        attachmentSummary && `Files in workspace:\n${attachmentSummary}`,
      ]
        .filter(Boolean)
        .join("\n\n")
        .trim();

      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fromAgentId: actorAgentId,
          toAgentId: resolvedTarget,
          content: isThreadSend ? gatewayMessage : trimmedContent,
          taskId,
          sessionKey:
            viewMode === "thread" && threadSessionKey ? threadSessionKey : undefined,
          channel: deliverExternally ? externalDeliveryChannel ?? undefined : undefined,
          attachments: attachmentsForPayload.length > 0 ? attachmentsForPayload : undefined,
          dispatch: isThreadSend ? false : undefined,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            details?: string;
            dispatchErrors?: Array<{ agentId?: string; error?: string }>;
          }
        | null;
      if (!response.ok || !payload?.ok) {
        // If we're in a live session thread, the Convex write is "nice to have" and
        // should not block delivering via OpenClaw. Surface the error and continue.
        if (isThreadSend) {
          toast.error("Message delivery started, but storing failed", {
            description: payload?.error || payload?.details || "Failed to store message",
          });
        } else {
          throw new Error(payload?.error || payload?.details || "Failed to send message");
        }
      }

      // Only show the agent-to-agent dispatch toast when this is NOT a session chat send.
      if (!isThreadSend) {
        if (Array.isArray(payload?.dispatchErrors) && payload.dispatchErrors.length > 0) {
          const firstError = payload.dispatchErrors[0];
          const details = `${firstError.agentId ?? "recipient"}: ${firstError.error ?? "unknown dispatch failure"}`;
          toast.error("Message stored, but live dispatch failed", {
            description: details,
          });
        } else {
          const destination = resolvedTarget
            ? `To ${agentsById.get(resolvedTarget)?.name ?? resolvedTarget}`
            : "Broadcast";
          toast.success("Message sent", { description: destination, duration: 1500 });
        }
      }

      if (viewMode === "thread" && threadSessionKey) {
        const sessionLabel =
          threadSessionOptions.find((option) => option.key === threadSessionKey)
            ?.label ?? threadSessionKey;
        const externalDestination = `${threadTargetName} · ${sessionLabel}`;
        const successLabel = externalDeliveryChannel
          ? `Delivered to ${formatExternalDeliveryChannel(externalDeliveryChannel)}`
          : "Delivered externally";

        const runId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `mc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

        const shouldStream = true;
        if (shouldStream) {
          setThreadTranscriptSource("gateway");
          setOptimisticGatewayMessage({
            id: `optimistic-${runId}`,
            createdAt: Date.now(),
            content: gatewayMessage,
            attachments: attachmentsForPayload.length > 0 ? attachmentsForPayload : undefined,
          });
          startChatStream({ sessionKey: threadSessionKey, runId });
        }

        try {
          const sendResponse = await fetch("/api/openclaw/chat/send", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              sessionKey: threadSessionKey,
              message: gatewayMessage,
              deliver: deliverExternally,
              idempotencyKey: runId,
              attachments: attachmentsForPayload.length > 0 ? attachmentsForPayload : undefined,
            }),
          });
          const sendPayload = (await sendResponse.json().catch(() => null)) as
            | { ok?: boolean; error?: string }
            | null;
          if (!sendResponse.ok || !sendPayload?.ok) {
            throw new Error(sendPayload?.error || "Failed to deliver message");
          }

          if (deliverExternally) {
            toast.success(successLabel, {
              description: externalDestination,
              duration: 1500,
            });
          }
        } catch (error) {
          if (shouldStream) {
            setOptimisticGatewayMessage(null);
            closeChatStream();
          }

          const description = `${externalDestination}: ${
            error instanceof Error ? error.message : "Delivery failed"
          }`;

          if (deliverExternally) {
            toast.error("Delivery failed", { description });
          } else {
            toast.error("Delivery failed", { description });
          }
        }
      }

      setContent("");
      setPendingAttachments([]);
      if (
        viewMode === "thread" &&
        threadSessionKey &&
        threadTranscriptSource === "gateway" &&
        typeof EventSource === "undefined"
      ) {
        void loadGatewayHistory({ switchView: false }).finally(() => {
          setOptimisticGatewayMessage(null);
        });
      }
      if (
        viewMode !== "thread" &&
        !(currentAgentId && currentAgentId !== actorAgentId)
      ) {
        setToAgentId(undefined);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      sendInFlightRef.current = false;
      setSending(false);
    }
  };

  const handleAbortRun = async () => {
    if (!threadSessionKey || !activeGatewayRunId) return;

    try {
      const response = await fetch("/api/openclaw/chat/abort", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionKey: threadSessionKey,
          runId: activeGatewayRunId,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Failed to stop run");
      }
    } catch (error) {
      toast.error("Stop failed", {
        description: error instanceof Error ? error.message : "Failed to stop run",
      });
    }
  };

  const activateThread = (agentId: string) => {
    setViewMode("thread");
    setThreadAgentId(agentId);
    setToAgentId(agentId);
    setSidebarOpen(false);
    inputRef.current?.focus();
  };

  const activateBroadcast = () => {
    setViewMode("broadcast");
    setToAgentId(undefined);
    setThreadHistoryError(null);
    setSidebarOpen(false);
    inputRef.current?.focus();
  };

  const activateAllMessages = () => {
    setViewMode("all");
    setSidebarOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentionPicker) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, filteredAgents.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const selected = filteredAgents[mentionIndex];
        if (selected) {
          insertMention(selected.id);
        }
      } else if (e.key === "Escape") {
        setShowMentionPicker(false);
      }
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (value: string) => {
    setContent(value);

    // Check for @ trigger
    const lastAtIndex = value.lastIndexOf("@");
    if (lastAtIndex !== -1) {
      const afterAt = value.slice(lastAtIndex + 1);
      // Check if we're in the middle of typing a mention
      if (!afterAt.includes(" ") && afterAt.length < 20) {
        setShowMentionPicker(true);
        setMentionFilter(afterAt);
        setMentionIndex(0);
        return;
      }
    }
    setShowMentionPicker(false);
  };

  const insertMention = (agentId: string) => {
    const lastAtIndex = content.lastIndexOf("@");
    if (lastAtIndex !== -1) {
      const newContent = content.slice(0, lastAtIndex) + `@${agentId} `;
      setContent(newContent);
    }
    setShowMentionPicker(false);
    inputRef.current?.focus();
  };

  const renderContent = useCallback((text: string) => {
    // Highlight @mentions
    const parts = text.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        const agentId = part.slice(1).toLowerCase();
        const agent = agentsById.get(agentId);
        return (
          <span key={i} className="chat-mention">
            {agent && <AgentAvatar agentId={agent.id} size="sm" />}
            {part}
          </span>
        );
      }
      return part;
    });
  }, [agentsById]);

  const usingGatewayThread =
    viewMode === "thread" &&
    Boolean(threadSessionKey) &&
    threadTranscriptSource === "gateway";
  const isLoadingMessages = usingGatewayThread
    ? threadHistoryLoading && threadHistory === null
    : !messages;

  const copyToClipboard = useCallback(async (text: string) => {
    const value = text ?? "";
    if (!value.trim()) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        toast.success("Copied");
        return;
      }
    } catch {
      // fall through to legacy copy
    }

    try {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  }, []);

  const renderedMessages = useMemo(() => {
    return searchedMessages.map((msg) => {
      const fromAgent = agentsById.get(msg.fromAgentId);
      const toAgent = msg.toAgentId ? agentsById.get(msg.toAgentId) : null;
      const isFromCurrent = msg.fromAgentId === actorAgentId;
      const isFocused = focusMessageId === msg.id;
      const messageAttachments = normalizeAttachments((msg as { attachments?: unknown }).attachments);
      const gatewayImages = Array.isArray((msg as { gatewayImages?: unknown }).gatewayImages)
        ? ((msg as { gatewayImages?: unknown }).gatewayImages as GatewayImage[])
        : [];
      const hasMessageText = typeof msg.content === "string" && msg.content.trim().length > 0;

      return (
        <div
          key={msg.id}
          id={`agent-message-${msg.id}`}
          className={`chat-message ${isFromCurrent ? "outgoing" : "incoming"}${isFocused ? " focused" : ""}`}
        >
          <div className="chat-message-avatar" aria-hidden="true">
            <AgentAvatar agentId={msg.fromAgentId} size="sm" />
          </div>
          <div className="chat-message-body">
            <div className="chat-message-header">
              <span className="chat-message-from">
                {fromAgent?.name ?? msg.fromAgentId}
              </span>
              {toAgent && (
                <>
                  <span className="chat-message-arrow">→</span>
                  <span className="chat-message-to">
                    {toAgent.name}
                  </span>
                </>
              )}
              {!msg.toAgentId && (
                <span className="chat-message-broadcast">broadcast</span>
              )}
              <span className="chat-message-time">
                <TimeAgo timestamp={msg.createdAt} />
              </span>
              <button
                type="button"
                className="chat-message-copy"
                onClick={() => void copyToClipboard(msg.content)}
                aria-label="Copy message"
                title="Copy message"
                disabled={!hasMessageText}
              >
                <MappedIcon name="copy" size="xs" />
              </button>
            </div>
            {hasMessageText && (
              <div className="chat-message-content">
                {renderContent(msg.content)}
              </div>
            )}
            {gatewayImages.length > 0 && (
              <div className="chat-message-images" aria-label="Image attachments">
                {gatewayImages.map((image, index) => (
                  <a
                    key={`${msg.id}-image-${index}`}
                    className="chat-message-image-link"
                    href={`data:${image.mimeType};base64,${image.data}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Open image"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="chat-message-image"
                      src={`data:${image.mimeType};base64,${image.data}`}
                      alt={`attachment-${index + 1}`}
                      loading="lazy"
                    />
                  </a>
                ))}
              </div>
            )}
            {messageAttachments.length > 0 && (
              <div className="chat-message-attachments">
                {messageAttachments.map((attachment, index) => {
                  const href = resolveAttachmentHref(attachment);
                  const sizeLabel = formatAttachmentSize(attachment.size);
                  const key = `${msg.id}-attachment-${index}`;

                  if (!href) {
                    return (
                      <span key={key} className="chat-message-attachment">
                        <MappedIcon name="link" size="xs" />
                        <span className="chat-message-attachment-name">{attachment.name}</span>
                        {sizeLabel && <span className="chat-attachment-size">{sizeLabel}</span>}
                      </span>
                    );
                  }

                  return (
                    <a
                      key={key}
                      href={href}
                      className="chat-message-attachment"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MappedIcon name="link" size="xs" />
                      <span className="chat-message-attachment-name">{attachment.name}</span>
                      {sizeLabel && <span className="chat-attachment-size">{sizeLabel}</span>}
                    </a>
                  );
                })}
              </div>
            )}
            {msg.taskId && (
              <a
                href={`/tasks/${msg.taskId}`}
                className="chat-message-task"
              >
                <MappedIcon name="tasks" size="sm" /> View Task
              </a>
            )}
          </div>
        </div>
      );
    });
  }, [actorAgentId, agentsById, copyToClipboard, focusMessageId, renderContent, searchedMessages]);

  return (
    <section className="section-card agent-chat-panel">
      <div className="chat-shell">
        <button
          type="button"
          className={`chat-sidebar-overlay ${sidebarOpen ? "open" : ""}`}
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
          tabIndex={sidebarOpen ? 0 : -1}
        />

        <aside
          className={`chat-sidebar ${sidebarOpen ? "open" : ""}`}
          aria-label="Chat sidebar"
        >
          <div className="chat-sidebar-header">
            <div className="chat-sidebar-title">
              <MappedIcon name="message" size="sm" />
              <span>Chat</span>
            </div>
            <button
              type="button"
              className="chat-sidebar-close"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <MappedIcon name="close" size="sm" />
            </button>
          </div>

          <div className="chat-sidebar-search">
            <input
              className="chat-sidebar-input"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder="Search agents…"
              aria-label="Search agents"
            />
          </div>

          <div className="chat-sidebar-section">
            <button
              type="button"
              className={`chat-sidebar-item ${viewMode === "all" ? "active" : ""}`}
              onClick={activateAllMessages}
            >
              <MappedIcon name="message" size="sm" />
              <span>All messages</span>
            </button>
            <button
              type="button"
              className={`chat-sidebar-item ${viewMode === "broadcast" ? "active" : ""}`}
              onClick={activateBroadcast}
            >
              <MappedIcon name="agents" size="sm" />
              <span>Broadcast</span>
            </button>
          </div>

          <div className="chat-sidebar-section">
            <div className="chat-sidebar-section-title">Agents</div>
            <div className="chat-sidebar-list">
              {!threadableAgents.length ? (
                <div className="chat-sidebar-empty">No agents</div>
              ) : sidebarAgents.length === 0 ? (
                <div className="chat-sidebar-empty">No matches</div>
              ) : (
                sidebarAgents.map((agent) => {
                  const active = viewMode === "thread" && threadAgentId === agent.id;
                  const status = typeof agent.status === "string" ? agent.status : "idle";

                  return (
                    <button
                      key={agent.id}
                      type="button"
                      className={`chat-agent-item ${active ? "active" : ""}`}
                      onClick={() => activateThread(agent.id)}
                    >
                      <span className="chat-agent-avatar">
                        <AgentAvatar agentId={agent.id} size="sm" />
                      </span>
                      <span className="chat-agent-name">{agent.name}</span>
                      <span className="chat-agent-id">@{agent.id}</span>
                      <span className={`chat-agent-status ${status}`} aria-hidden="true" />
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {viewMode === "thread" && threadAgentId && (
            <div className="chat-sidebar-section">
              <div className="chat-sidebar-section-title">Sessions</div>
              <div className="chat-sidebar-sessions">
                {!threadSessionOptions.length ? (
                  <div className="chat-sidebar-empty">No sessions</div>
                ) : (
                  threadSessionOptions.map((session) => {
                    const active = session.key === threadSessionKey;
                    const channel = inferExternalDeliveryChannel(session.key);
                    return (
                      <button
                        key={session.key}
                        type="button"
                        className={`chat-session-item ${active ? "active" : ""}`}
                        onClick={() => setThreadSessionKey(session.key)}
                        title={session.key}
                      >
                        <span className="chat-session-label">{session.label}</span>
                        {channel && (
                          <span className="chat-session-badge">
                            {formatExternalDeliveryChannel(channel)}
                          </span>
                        )}
                        {session.updatedAt > 0 && (
                          <span className="chat-session-time">
                            <TimeAgo timestamp={session.updatedAt} />
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          <div className="chat-sidebar-footer">
            <span className="chat-sidebar-footer-label">
              Sending as{" "}
              <strong>{agentsById.get(actorAgentId)?.name ?? actorAgentId}</strong>
            </span>
          </div>
        </aside>

        <div className="chat-main">
          <div className="chat-topbar">
            <div className="chat-topbar-left">
              <button
                type="button"
                className="chat-sidebar-toggle"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <MappedIcon name="agents" size="sm" />
              </button>

              <div className="chat-topbar-titles">
                <div className="chat-topbar-title">
                  {viewMode === "thread"
                    ? threadTargetName
                    : viewMode === "broadcast"
                      ? "Broadcast"
                      : "All Messages"}
                </div>
                <div className="chat-topbar-sub">
                  {viewMode === "thread" ? (
                    threadSessionKey ? (
                      <>
                        {selectedThreadSession?.label && (
                          <span className="chat-topbar-pill">
                            {selectedThreadSession.label}
                          </span>
                        )}
                        <code className="chat-topbar-code">{threadSessionKey}</code>
                        {externalDeliveryChannel && (
                          <span className="chat-topbar-badge">
                            {formatExternalDeliveryChannel(externalDeliveryChannel)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span>Pick a session to view the thread</span>
                    )
                  ) : viewMode === "broadcast" ? (
                    <span>Message all agents</span>
                  ) : (
                    <span>Browse all messages</span>
                  )}
                </div>
              </div>
            </div>

            <div className="chat-topbar-actions">
              <div className="chat-topbar-search" role="search" aria-label="Search chat">
                <MappedIcon name="search" size="sm" />
                <input
                  className="chat-topbar-search-input"
                  value={messageSearch}
                  onChange={(e) => setMessageSearch(e.target.value)}
                  placeholder="Search chat…"
                  aria-label="Search chat"
                />
                {messageSearch.trim().length > 0 && (
                  <button
                    type="button"
                    className="chat-topbar-search-clear"
                    onClick={() => setMessageSearch("")}
                    aria-label="Clear message search"
                    title="Clear search"
                  >
                    <MappedIcon name="close" size="xs" />
                  </button>
                )}
                {deferredMessageSearch.trim().length > 0 && (
                  <span className="chat-topbar-search-count" aria-label="Search results">
                    {searchedMessages.length}/{displayedMessages.length}
                  </span>
                )}
              </div>
              {viewMode !== "thread" && (
                <select
                  className="chat-topbar-select"
                  value={toAgentId ?? ""}
                  onChange={(e) => setToAgentId(e.target.value || undefined)}
                  aria-label="Message destination"
                >
                  <option value="">Broadcast</option>
                  {normalizedAgents?.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              )}

              {viewMode === "thread" && threadSessionKey && (
                <>
                  <div className="chat-transcript-toggle" role="group" aria-label="Transcript source">
                    <button
                      type="button"
                      className={`chat-transcript-btn ${threadTranscriptSource === "gateway" ? "active" : ""}`}
                      onClick={() => {
                        if (threadHistory) {
                          setThreadTranscriptSource("gateway");
                        } else {
                          void loadGatewayHistory({ switchView: true });
                        }
                      }}
                      title="Live transcript (streaming + attachments)"
                    >
                      Live
                    </button>
                    <button
                      type="button"
                      className={`chat-transcript-btn ${threadTranscriptSource === "convex" ? "active" : ""}`}
                      onClick={() => setThreadTranscriptSource("convex")}
                    >
                      Saved
                    </button>
                  </div>

                  <button
                    type="button"
                    className="chat-action-btn"
                    onClick={() => void syncThreadToConvex()}
                    disabled={syncingThread || sending}
                    title="Save live transcript"
                  >
                    {syncingThread ? "Saving..." : "Save"}
                  </button>

                  <button
                    type="button"
                    className="chat-action-btn"
                    onClick={() => void loadGatewayHistory({ switchView: true })}
                    disabled={threadHistoryLoading || threadHistoryInFlightRef.current}
                    title="Refresh live transcript"
                  >
                    {threadHistory ? "Refresh" : "Load"}
                  </button>

                  {threadTranscriptSource === "gateway" && activeGatewayToolEvents.length > 0 && (
                    <button
                      type="button"
                      className={`chat-action-btn ${showToolEvents ? "active" : ""}`}
                      onClick={() => setShowToolEvents((current) => !current)}
                      title="Show tool events for the active run"
                    >
                      Tools ({activeGatewayToolEvents.length})
                    </button>
                  )}

                  {threadTranscriptSource === "gateway" && threadHistoryCached !== null && (
                    <span className="chat-action-hint">
                      {threadHistoryCached ? "cached" : "live"}
                    </span>
                  )}

                  <label className="chat-deliver-toggle">
                    <input
                      type="checkbox"
                      checked={deliverExternally}
                      onChange={(event) => setDeliverExternally(event.target.checked)}
                      disabled={sending}
                    />
                    <span>Deliver externally</span>
                    {externalDeliveryChannel && (
                      <span className="chat-deliver-hint">
                        {formatExternalDeliveryChannel(externalDeliveryChannel)}
                      </span>
                    )}
                  </label>

                  {threadTranscriptSource === "gateway" && threadHistoryError && (
                    <span className="chat-topbar-error" role="status">
                      {threadHistoryError}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {viewMode === "thread" &&
            threadSessionKey &&
            threadTranscriptSource === "gateway" &&
            showToolEvents &&
            activeGatewayToolEvents.length > 0 && (
              <div className="chat-tool-events" role="region" aria-label="Tool events">
                {activeGatewayToolEvents.slice(-10).map((evt, index) => (
                  <div
                    key={`${evt.runId}-${evt.seq}-${evt.ts}-${index}`}
                    className="chat-tool-event"
                  >
                    <span className="chat-tool-event-meta">
                      {new Date(evt.ts).toLocaleTimeString()}
                    </span>
                    <code className="chat-tool-event-code">
                      {truncateString(safeJsonString(evt.data), 320)}
                    </code>
                  </div>
                ))}
              </div>
            )}

          <div className="chat-messages" ref={messagesContainerRef} onScroll={handleMessagesScroll}>
            {isLoadingMessages ? (
              <div className="chat-loading">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="skeleton h-16 rounded-lg" />
                ))}
              </div>
            ) : usingGatewayThread && threadHistoryError && threadHistory === null ? (
              <div className="chat-empty">
                <div className="chat-empty-title">Session load failed</div>
                <div className="chat-empty-sub">{threadHistoryError}</div>
              </div>
            ) : displayedMessages.length === 0 ? (
              <div className="chat-empty">
                <div className="chat-empty-icon" aria-hidden="true"><MappedIcon name="message" size="lg" /></div>
                <div className="chat-empty-title">No messages yet</div>
                <div className="chat-empty-sub">
                  {viewMode === "thread"
                    ? threadTranscriptSource === "gateway"
                      ? "No live messages for this session yet."
                      : "No saved messages for this session yet. Click Save or switch to Live."
                    : "Start a conversation by mentioning an agent (for example: @builder)"}
                </div>
              </div>
            ) : searchedMessages.length === 0 ? (
              <div className="chat-empty">
                <div className="chat-empty-icon" aria-hidden="true">
                  <MappedIcon name="search" size="lg" />
                </div>
                <div className="chat-empty-title">No matches</div>
                <div className="chat-empty-sub">
                  Nothing matches{" "}
                  <code className="chat-empty-code">{deferredMessageSearch.trim()}</code>.
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm mt-4"
                  onClick={() => setMessageSearch("")}
                >
                  Clear search
                </button>
              </div>
            ) : (
              <>
                {renderedMessages}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {showJumpToLatest && (
            <button
              type="button"
              className="chat-jump-btn"
              onClick={() => {
                scrollMessagesToBottom();
                setShowJumpToLatest(false);
              }}
            >
              Jump to latest
            </button>
          )}

          <div className="chat-composer">
            <div className="chat-input-wrapper">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                aria-label="Attach files"
                className="chat-file-input"
                onChange={(event) => {
                  void handleAttachmentSelect(event.target.files);
                  event.target.value = "";
                }}
              />
              <textarea
                ref={inputRef}
                className="chat-input"
                value={content}
                onChange={(e) => handleInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${
                  viewMode === "thread"
                    ? threadTargetName
                    : toAgentId
                      ? agentsById.get(toAgentId)?.name ?? toAgentId
                      : "all agents"
                }... (use @mention)`}
                rows={1}
              />
              {pendingAttachments.length > 0 && (
                <div className="chat-composer-attachments" aria-live="polite">
                  {pendingAttachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className={`chat-composer-attachment ${attachment.status}`}
                    >
                      <span
                        className="chat-composer-attachment-status"
                        title={attachment.error || undefined}
                      >
                        <MappedIcon
                          name={
                            attachment.status === "error"
                              ? "warning"
                              : attachment.status === "ready"
                                ? "check"
                                : "upload"
                          }
                          size="xs"
                        />
                      </span>
                      <span
                        className="chat-composer-attachment-name"
                        title={attachment.error || attachment.name}
                      >
                        {attachment.name}
                      </span>
                      <button
                        type="button"
                        className="chat-composer-attachment-remove"
                        onClick={() => removeAttachment(attachment.id)}
                        aria-label={`Remove attachment ${attachment.name}`}
                      >
                        <MappedIcon name="close" size="xs" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {showMentionPicker && filteredAgents.length > 0 && (
                <div className="mention-picker">
                  {filteredAgents.slice(0, 6).map((agent, i) => (
                    <button
                      key={agent.id}
                      className={`mention-item ${i === mentionIndex ? "active" : ""}`}
                      onClick={() => insertMention(agent.id)}
                      onMouseEnter={() => setMentionIndex(i)}
                    >
                      <span className="mention-emoji"><AgentAvatar agentId={agent.id} size="sm" /></span>
                      <span className="mention-name">{agent.name}</span>
                      <span className="mention-id">@{agent.id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn btn-secondary chat-attach"
              onClick={() => fileInputRef.current?.click()}
              disabled={
                sending ||
                (viewMode === "thread" &&
                  activeGatewayRunId !== null &&
                  (activeGatewayRunState === "connecting" || activeGatewayRunState === "streaming"))
              }
            >
              <MappedIcon name="upload" size="sm" />
              Attach
            </button>
            {viewMode === "thread" &&
              threadSessionKey &&
              activeGatewayRunId !== null &&
              (activeGatewayRunState === "connecting" || activeGatewayRunState === "streaming") && (
                <button
                  type="button"
                  className="btn btn-secondary chat-stop"
                  onClick={handleAbortRun}
                  disabled={sending}
                >
                  Stop
                </button>
              )}
            <button
              className="btn btn-primary chat-send"
              onClick={handleSend}
              disabled={
                sending ||
                (!content.trim() && attachmentsForPayload.length === 0) ||
                uploadingAttachmentCount > 0 ||
                hasAttachmentErrors ||
                (viewMode === "thread" && !threadAgentId) ||
                (viewMode === "thread" &&
                  activeGatewayRunId !== null &&
                  (activeGatewayRunState === "connecting" || activeGatewayRunState === "streaming"))
              }
            >
              {sending ? "..." : uploadingAttachmentCount > 0 ? `Uploading (${uploadingAttachmentCount})` : "Send"}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .agent-chat-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .chat-shell {
          position: relative;
          flex: 1;
          min-height: 0;
          display: grid;
          grid-template-columns: 272px 1fr;
        }

        .chat-sidebar-overlay {
          display: none;
        }

        .chat-sidebar {
          min-height: 0;
          overflow-y: auto;
          border-right: 1px solid var(--hairline);
          background: var(--bg-base);
          padding: 12px 12px 16px;
        }
        .chat-sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 4px 4px 10px;
        }
        .chat-sidebar-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--text-dim);
        }
        .chat-sidebar-close {
          display: none;
          border: none;
          background: transparent;
          color: var(--text-dim);
          cursor: pointer;
          padding: 6px;
          border-radius: var(--radius-sm);
        }
        .chat-sidebar-close:hover {
          background: rgba(255, 255, 255, 0.06);
          color: var(--text-secondary);
        }

        .chat-sidebar-search {
          padding: 0 4px 10px;
        }
        .chat-sidebar-input {
          width: 100%;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-md);
          padding: 10px 10px;
          color: var(--text-primary);
          font-size: 12px;
          outline: none;
          transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
        }
        .chat-sidebar-input::placeholder {
          color: var(--text-placeholder);
        }
        .chat-sidebar-input:focus {
          border-color: var(--accent-strong);
          box-shadow: 0 0 0 3px var(--accent-soft);
        }

        .chat-sidebar-section {
          padding: 10px 4px 0;
        }
        .chat-sidebar-section + .chat-sidebar-section {
          margin-top: 10px;
          border-top: 1px solid var(--hairline);
          padding-top: 12px;
        }
        .chat-sidebar-section-title {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-dim);
          margin-bottom: 8px;
        }

        .chat-sidebar-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 10px;
          border-radius: var(--radius-md);
          border: 1px solid transparent;
          background: transparent;
          cursor: pointer;
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 600;
          transition: background var(--transition-fast), border-color var(--transition-fast),
            color var(--transition-fast);
          text-align: left;
        }
        .chat-sidebar-item:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: var(--chrome);
          color: var(--text-primary);
        }
        .chat-sidebar-item.active {
          background: rgba(139, 92, 246, 0.14);
          border-color: rgba(139, 92, 246, 0.28);
          color: var(--text-primary);
        }

        .chat-sidebar-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .chat-sidebar-empty {
          padding: 10px 10px;
          color: var(--text-dim);
          font-size: 12px;
          border: 1px dashed var(--hairline);
          border-radius: var(--radius-md);
        }

        .chat-agent-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 10px;
          border-radius: var(--radius-md);
          border: 1px solid transparent;
          background: transparent;
          cursor: pointer;
          color: var(--text-secondary);
          text-align: left;
          transition: background var(--transition-fast), border-color var(--transition-fast),
            color var(--transition-fast), transform var(--transition-fast);
        }
        .chat-agent-item:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: var(--chrome);
          color: var(--text-primary);
          transform: translateY(-1px);
        }
        .chat-agent-item:active {
          transform: translateY(0);
          transition: transform 50ms ease;
        }
        .chat-agent-item.active {
          background: rgba(139, 92, 246, 0.14);
          border-color: rgba(139, 92, 246, 0.28);
          color: var(--text-primary);
        }
        .chat-agent-avatar {
          display: inline-flex;
        }
        .chat-agent-name {
          font-size: 12px;
          font-weight: 700;
          color: inherit;
        }
        .chat-agent-id {
          margin-left: auto;
          font-size: 11px;
          color: var(--text-dim);
        }
        .chat-agent-item.active .chat-agent-id {
          color: var(--text-secondary);
        }
        .chat-agent-status {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: var(--text-muted);
          box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.03);
        }
        .chat-agent-status.working {
          background: var(--accent-primary);
          box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.16);
        }
        .chat-agent-status.idle {
          background: #4b4b4b;
        }
        .chat-agent-status.offline {
          background: #2a2a2a;
        }
        .chat-agent-status.error {
          background: var(--accent-error);
          box-shadow: 0 0 0 4px rgba(229, 72, 77, 0.14);
        }

        .chat-sidebar-sessions {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .chat-session-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 10px;
          border-radius: var(--radius-md);
          border: 1px solid transparent;
          background: transparent;
          cursor: pointer;
          color: var(--text-secondary);
          transition: background var(--transition-fast), border-color var(--transition-fast),
            color var(--transition-fast);
          text-align: left;
        }
        .chat-session-item:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: var(--chrome);
          color: var(--text-primary);
        }
        .chat-session-item.active {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(139, 92, 246, 0.22);
          color: var(--text-primary);
        }
        .chat-session-label {
          font-weight: 700;
          font-size: 12px;
        }
        .chat-session-badge {
          margin-left: auto;
          padding: 2px 7px;
          border-radius: 999px;
          border: 1px solid var(--hairline);
          background: rgba(0, 0, 0, 0.3);
          font-size: 10px;
          color: var(--text-dim);
        }
        .chat-session-time {
          font-size: 10px;
          color: var(--text-dim);
        }

        .chat-sidebar-footer {
          margin-top: 12px;
          padding: 12px 4px 0;
          border-top: 1px solid var(--hairline);
          color: var(--text-dim);
          font-size: 11px;
        }
        .chat-sidebar-footer strong {
          color: var(--text-secondary);
          font-weight: 600;
        }

        .chat-main {
          position: relative;
          min-width: 0;
          min-height: 0;
          display: flex;
          flex-direction: column;
          background: var(--bg-elevated);
        }
        .chat-topbar {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid var(--hairline);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0));
        }
        .chat-topbar-left {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .chat-sidebar-toggle {
          display: none;
          border: 1px solid var(--hairline);
          background: rgba(255, 255, 255, 0.03);
          border-radius: var(--radius-md);
          padding: 8px;
          color: var(--text-secondary);
          cursor: pointer;
        }
        .chat-sidebar-toggle:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: var(--chrome);
          color: var(--text-primary);
        }

        .chat-topbar-titles {
          min-width: 0;
        }
        .chat-topbar-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: 0.01em;
        }
        .chat-topbar-sub {
          margin-top: 2px;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: var(--text-dim);
        }
        .chat-topbar-pill {
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid var(--hairline);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-secondary);
          font-size: 10px;
          font-weight: 700;
        }
        .chat-topbar-code {
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid var(--hairline);
          background: rgba(0, 0, 0, 0.28);
          color: var(--text-secondary);
          font-size: 10px;
          max-width: 520px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .chat-topbar-badge {
          padding: 2px 8px;
          border-radius: 999px;
          background: rgba(70, 167, 88, 0.1);
          border: 1px solid rgba(70, 167, 88, 0.25);
          color: var(--accent-success);
          font-size: 10px;
          font-weight: 700;
        }
        .chat-topbar-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          justify-content: flex-end;
        }

        .chat-topbar-search {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 7px 10px;
          border-radius: 999px;
          border: 1px solid var(--hairline);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-dim);
          flex: 1 1 240px;
          min-width: 220px;
          max-width: 340px;
        }

        .chat-topbar-search:focus-within {
          border-color: rgba(139, 92, 246, 0.35);
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.12);
        }

        .chat-topbar-search-input {
          flex: 1;
          min-width: 0;
          border: none;
          outline: none;
          background: transparent;
          color: var(--text-secondary);
          font-size: 11px;
        }

        .chat-topbar-search-input::placeholder {
          color: var(--text-placeholder);
        }

        .chat-topbar-search-clear {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: transparent;
          padding: 2px;
          border-radius: 999px;
          color: var(--text-muted);
          cursor: pointer;
        }

        .chat-topbar-search-clear:hover {
          background: rgba(255, 255, 255, 0.06);
          color: var(--text-primary);
        }

        .chat-topbar-search-count {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.02em;
          color: var(--text-dim);
        }

        .chat-topbar-select {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--hairline);
          border-radius: 999px;
          padding: 7px 12px;
          color: var(--text-secondary);
          font-size: 11px;
          cursor: pointer;
        }

        .chat-transcript-toggle {
          display: flex;
          border: 1px solid var(--hairline);
          border-radius: 999px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.02);
        }
        .chat-transcript-btn {
          border: none;
          background: transparent;
          padding: 7px 10px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.02em;
          color: var(--text-dim);
          cursor: pointer;
          transition: background var(--transition-fast), color var(--transition-fast);
        }
        .chat-transcript-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.06);
          color: var(--text-secondary);
        }
        .chat-transcript-btn.active {
          background: rgba(139, 92, 246, 0.16);
          color: var(--text-primary);
        }
        .chat-transcript-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .chat-action-btn {
          border: 1px solid var(--hairline);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.03);
          padding: 7px 12px;
          color: var(--text-secondary);
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          transition: background var(--transition-fast), border-color var(--transition-fast),
            color var(--transition-fast);
        }
        .chat-action-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.06);
          border-color: var(--chrome);
        }
        .chat-action-btn.active {
          background: rgba(139, 92, 246, 0.16);
          border-color: rgba(139, 92, 246, 0.28);
          color: var(--text-primary);
        }
        .chat-action-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .chat-action-hint {
          opacity: 0.7;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-size: 10px;
          color: var(--text-dim);
        }
        .chat-topbar-error {
          max-width: 320px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #ffb4b4;
          font-size: 11px;
          font-weight: 600;
        }

        .chat-deliver-toggle {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--hairline);
          border-radius: 999px;
          padding: 7px 10px;
          color: var(--text-secondary);
          font-size: 11px;
          cursor: pointer;
          user-select: none;
          font-weight: 700;
        }
        .chat-deliver-toggle input {
          cursor: pointer;
        }
        .chat-deliver-hint {
          opacity: 0.75;
          font-weight: 800;
          letter-spacing: 0.01em;
        }

        .chat-tool-events {
          margin: 10px 16px 0;
          padding: 10px 12px;
          border: 1px solid var(--hairline);
          border-radius: var(--radius-md);
          background: rgba(0, 0, 0, 0.28);
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-family: var(--font-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
          font-size: 10px;
          color: var(--text-dim);
        }
        .chat-tool-event {
          display: flex;
          gap: 10px;
          align-items: flex-start;
        }
        .chat-tool-event-meta {
          flex: 0 0 auto;
          opacity: 0.7;
          letter-spacing: 0.02em;
        }
        .chat-tool-event-code {
          color: var(--text-secondary);
          white-space: pre-wrap;
          word-break: break-word;
        }
        .chat-messages {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          scrollbar-gutter: stable;
        }
        .chat-loading {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .chat-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 40px;
        }
        .chat-empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
          opacity: 0.5;
        }
        .chat-empty-title {
          font-size: 14px;
          color: var(--text-muted);
          margin-bottom: 4px;
        }
        .chat-empty-sub {
          font-size: 12px;
          color: var(--text-dim);
          max-width: 420px;
        }
        .chat-empty-code {
          padding: 1px 6px;
          border-radius: 999px;
          border: 1px solid var(--hairline);
          background: rgba(0, 0, 0, 0.28);
          color: var(--text-secondary);
          font-size: 11px;
          white-space: nowrap;
        }
        .chat-message {
          display: flex;
          gap: 12px;
          padding: 12px 14px;
          border-radius: var(--radius-md);
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--hairline);
          transition: background-color var(--transition-fast),
                      border-color var(--transition-fast);
          animation: message-in 0.2s ease-out;
        }
        @keyframes message-in {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .chat-message:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: var(--chrome);
        }
        .chat-message.focused {
          border-color: rgba(139, 92, 246, 0.55);
          box-shadow:
            0 0 0 1px rgba(139, 92, 246, 0.25),
            0 0 0 6px rgba(139, 92, 246, 0.08);
          background: rgba(139, 92, 246, 0.08);
        }
        .chat-message.outgoing {
          background: rgba(139, 92, 246, 0.08);
          border-color: rgba(139, 92, 246, 0.18);
        }
        .chat-message.outgoing:hover {
          background: rgba(139, 92, 246, 0.11);
        }
        .chat-message-avatar {
          width: 36px;
          height: 36px;
          border-radius: var(--radius-sm);
          background: rgba(255, 255, 255, 0.04);
          display: grid;
          place-items: center;
          font-size: 18px;
          flex-shrink: 0;
        }
        .chat-message-body {
          flex: 1;
          min-width: 0;
        }
        .chat-message-header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          margin-bottom: 6px;
          flex-wrap: wrap;
        }
        .chat-message-from {
          font-weight: 600;
          color: var(--text-primary);
        }
        .chat-message-arrow {
          color: var(--text-dim);
        }
        .chat-message-to {
          color: var(--text-secondary);
        }
        .chat-message-broadcast {
          padding: 2px 6px;
          background: rgba(101, 227, 165, 0.1);
          border-radius: var(--radius-xs);
          color: var(--state-success);
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .chat-message-time {
          color: var(--text-dim);
          margin-left: auto;
        }
        .chat-message-copy {
          border: 1px solid transparent;
          background: transparent;
          color: var(--text-dim);
          padding: 4px;
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: background-color var(--transition-fast), border-color var(--transition-fast),
            color var(--transition-fast);
        }
        .chat-message-copy:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.06);
          border-color: var(--hairline);
          color: var(--text-secondary);
        }
        .chat-message-copy:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .chat-message-content {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.5;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .chat-message-images {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 10px;
        }
        .chat-message-image-link {
          display: block;
          border: 1px solid var(--hairline);
          border-radius: var(--radius-sm);
          overflow: hidden;
          background: rgba(255, 255, 255, 0.03);
          max-width: 240px;
        }
        .chat-message-image-link:hover {
          border-color: var(--chrome);
          background: rgba(255, 255, 255, 0.06);
        }
        .chat-message-image {
          display: block;
          width: auto;
          height: auto;
          max-width: 240px;
          max-height: 200px;
          object-fit: cover;
        }
        .chat-message-attachments {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 8px;
        }
        .chat-message-attachment {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          max-width: 100%;
          padding: 4px 8px;
          border: 1px solid var(--hairline);
          border-radius: var(--radius-sm);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-muted);
          font-size: 11px;
          text-decoration: none;
          transition: background-color var(--transition-fast),
                      color var(--transition-fast);
        }
        .chat-message-attachment:hover {
          background: rgba(255, 255, 255, 0.08);
          color: var(--text-secondary);
        }
        .chat-message-attachment-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 200px;
        }
        .chat-attachment-size {
          color: var(--text-dim);
          font-size: 10px;
        }
        .chat-message-task {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          margin-top: 8px;
          padding: 4px 8px;
          background: rgba(255, 255, 255, 0.04);
          border-radius: var(--radius-sm);
          font-size: 11px;
          color: var(--text-muted);
          text-decoration: none;
          transition: background-color var(--transition-fast),
                      color var(--transition-fast);
        }
        .chat-message-task:hover {
          background: rgba(255, 255, 255, 0.08);
          color: var(--text-secondary);
        }
        :global(.chat-mention) {
          color: var(--accent);
          font-weight: 500;
          background: var(--accent-soft);
          padding: 1px 4px;
          border-radius: var(--radius-xs);
          display: inline-flex;
          align-items: center;
          gap: 3px;
          vertical-align: middle;
        }

        .chat-jump-btn {
          position: absolute;
          right: 18px;
          bottom: calc(92px + env(safe-area-inset-bottom));
          border: 1px solid var(--hairline);
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.55);
          color: var(--text-primary);
          padding: 8px 12px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.01em;
          cursor: pointer;
          backdrop-filter: blur(10px);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
          transition: background var(--transition-fast), border-color var(--transition-fast),
            transform var(--transition-fast);
        }
        .chat-jump-btn:hover {
          border-color: var(--chrome);
          background: rgba(0, 0, 0, 0.72);
          transform: translateY(-1px);
        }
        .chat-jump-btn:active {
          transform: translateY(0);
          transition: transform 50ms ease;
        }

        .chat-composer {
          display: flex;
          gap: 10px;
          padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
          border-top: 1px solid var(--hairline);
          background: linear-gradient(0deg, rgba(0, 0, 0, 0.25), rgba(0, 0, 0, 0));
        }
        .chat-input-wrapper {
          flex: 1;
          position: relative;
        }
        .chat-file-input {
          display: none;
        }
        .chat-input {
          width: 100%;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-md);
          padding: 12px 14px;
          color: var(--text-primary);
          font-size: 13px;
          resize: none;
          min-height: 44px;
          max-height: 160px;
          transition: border-color var(--transition-fast),
                      box-shadow var(--transition-fast);
        }
        .chat-input:focus {
          outline: none;
          border-color: var(--accent-strong);
          box-shadow: 0 0 0 3px var(--accent-soft);
        }
        .chat-composer-attachments {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 8px;
        }
        .chat-composer-attachment {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          max-width: 100%;
          padding: 4px 8px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--hairline);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-muted);
          font-size: 11px;
        }
        .chat-composer-attachment.ready {
          border-color: rgba(101, 227, 165, 0.4);
          color: var(--state-success);
          background: rgba(101, 227, 165, 0.08);
        }
        .chat-composer-attachment.uploading {
          border-color: rgba(123, 223, 246, 0.35);
          color: var(--accent);
          background: rgba(123, 223, 246, 0.08);
        }
        .chat-composer-attachment.error {
          border-color: rgba(255, 123, 123, 0.35);
          color: var(--state-error);
          background: rgba(255, 123, 123, 0.08);
        }
        .chat-composer-attachment-status {
          display: inline-flex;
          align-items: center;
        }
        .chat-composer-attachment-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 180px;
        }
        .chat-composer-attachment-remove {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          border: none;
          border-radius: var(--radius-xs);
          color: inherit;
          background: transparent;
          cursor: pointer;
          transition: background-color var(--transition-fast);
        }
        .chat-composer-attachment-remove:hover {
          background: rgba(255, 255, 255, 0.12);
        }
        .chat-attach {
          align-self: flex-end;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-width: 90px;
        }
        .chat-send {
          align-self: flex-end;
          min-width: 80px;
          transform: translateY(0);
        }
        .chat-send:hover:not(:disabled) {
          transform: translateY(-1px);
        }
        .chat-send:active:not(:disabled) {
          transform: translateY(0);
        }
        .mention-picker {
          position: absolute;
          bottom: 100%;
          left: 0;
          right: 0;
          margin-bottom: 8px;
          background: var(--bg-elevated);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-soft);
          overflow: hidden;
          z-index: 50;
        }
        .mention-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px 14px;
          background: transparent;
          border: none;
          color: var(--text-secondary);
          font-size: 13px;
          cursor: pointer;
          text-align: left;
          transition: background var(--transition-fast);
        }
        .mention-item:hover,
        .mention-item.active {
          background: var(--bg-hover);
        }
        .mention-emoji {
          font-size: 16px;
        }
        .mention-name {
          font-weight: 500;
          color: var(--text-primary);
        }
        .mention-id {
          margin-left: auto;
          color: var(--text-dim);
          font-size: 11px;
        }

        @media (max-width: 980px) {
          .chat-shell {
            grid-template-columns: 1fr;
          }
          .chat-sidebar-overlay {
            display: block;
            position: absolute;
            inset: 0;
            border: none;
            padding: 0;
            margin: 0;
            background: rgba(0, 0, 0, 0.55);
            opacity: 0;
            pointer-events: none;
            transition: opacity 150ms ease;
            z-index: 30;
          }
          .chat-sidebar-overlay.open {
            opacity: 1;
            pointer-events: auto;
          }
          .chat-sidebar {
            position: absolute;
            top: 0;
            bottom: 0;
            left: 0;
            width: min(320px, 86vw);
            transform: translateX(-105%);
            transition: transform 180ms cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 40;
            box-shadow: 0 18px 60px rgba(0, 0, 0, 0.65);
          }
          .chat-sidebar.open {
            transform: translateX(0);
          }
          .chat-sidebar-close {
            display: inline-flex;
          }
          .chat-sidebar-toggle {
            display: inline-flex;
          }
          .chat-topbar-code {
            max-width: 240px;
          }
          .chat-jump-btn {
            right: 12px;
            bottom: calc(84px + env(safe-area-inset-bottom));
          }
        }
      `}</style>
    </section>
  );
});
