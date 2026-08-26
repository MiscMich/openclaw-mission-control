"use client";

import { memo, useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/lib/convexApi";
import * as Cmdk from "cmdk";
import { MappedIcon, type MappedIconName } from "@/components/ui";

const Command = Cmdk.Command;
const CommandInput = Cmdk.CommandInput;
const CommandList = Cmdk.CommandList;
const CommandEmpty = Cmdk.CommandEmpty;
const CommandGroup = Cmdk.CommandGroup;
const CommandItem = Cmdk.CommandItem;

// =============================================================================
// TYPES
// =============================================================================

type Agent = {
  id: string;
  name: string;
  emoji: string;
  role: string;
  status: string;
};

type Task = {
  id: string;
  title: string;
  status: string;
  priority?: string;
  assigneeId?: string;
};

type Activity = {
  id: string;
  type: string;
  message: string;
  agentId?: string;
  taskId?: string;
  createdAt: number;
};

type Document = {
  id: string;
  title: string;
  content: string;
  type: string;
  taskId?: string;
  sourcePath?: string;
  sourceKind?: string;
  createdBy: string;
  createdAt: number;
  updatedAt?: number;
};

type AgentMessage = {
  id: string;
  fromAgentId: string;
  toAgentId?: string;
  content: string;
  taskId?: string;
  createdAt: number;
};

type SessionStreamItem = {
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

// =============================================================================
// ICON MAPPINGS (per rerender-memo-with-default-value rule - hoisted outside)
// =============================================================================

const STATUS_ICONS: Record<string, MappedIconName> = {
  inbox: "tasks",
  assigned: "robot",
  in_progress: "lightning",
  review: "search",
  completed: "check",
  done: "check",
  blocked: "blocked",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "var(--accent-error)",
  high: "var(--accent-warning)",
  medium: "var(--accent-primary)",
  low: "var(--text-muted)",
};

const OPERATOR_ID = "operator";

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

function extractSessionAgentId(session: SessionStreamItem): string | undefined {
  if (session.agentId) return session.agentId;
  if (session.key) {
    const parts = session.key.split(":");
    if (parts[0] === "agent" && parts[1]) return parts[1];
  }
  return undefined;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const CommandPalette = memo(function CommandPalette({
  open,
  setOpen,
  onNewTask,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  onNewTask: () => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [files, setFiles] = useState<Array<{ name: string; path: string; type: "file" | "dir" }>>([]);
  const [cronJobs, setCronJobs] = useState<{ id?: string; name?: string; cron?: string; schedule?: string }[]>([]);
  const [sessions, setSessions] = useState<SessionStreamItem[]>([]);

  const agentsResult = useQuery(api.agents.list, open ? {} : "skip");
  const tasksResult = useQuery(api.tasks.list, open ? {} : "skip");
  const activityResult = useQuery(api.activity.list, open ? {} : "skip");
  const documentsResult = useQuery(api.documents.listRecent, open ? { limit: 50 } : "skip");
  const agentMessagesResult = useQuery(api.agentMessages.list, open ? { limit: 100 } : "skip");
  const agents = useMemo(() => (agentsResult ?? []) as Agent[], [agentsResult]);
  const tasks = useMemo(() => (tasksResult?.tasks ?? []) as Task[], [tasksResult]);
  const activity = useMemo(
    () => (activityResult?.activities ?? []) as Activity[],
    [activityResult]
  );
  const documents = useMemo(() => (documentsResult ?? []) as Document[], [documentsResult]);
  const agentMessages = useMemo(() => (agentMessagesResult ?? []) as AgentMessage[], [agentMessagesResult]);

  // Create agent lookup map (per js-index-maps rule)
  const agentsById = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const agent of agents) {
      map.set(agent.id, agent);
    }
    return map;
  }, [agents]);

  // Fetch files and cron data when palette opens
  useEffect(() => {
    if (!open) return;
    let active = true;
    // Fetch files
    fetch("/api/openclaw/files?recursive=true")
      .then(r => r.json())
      .then(data => {
        if (!active) return;
        if (data.ok && Array.isArray(data.files)) setFiles(data.files);
      })
      .catch(() => {});
    // Fetch cron jobs
    fetch("/api/openclaw/cron/list?all=1")
      .then(r => r.json())
      .then(data => {
        if (!active) return;
        const jobs = data.ok ? (Array.isArray(data.data) ? data.data : data.data?.jobs ?? []) : [];
        setCronJobs(jobs);
      })
      .catch(() => {});
    // Fetch sessions
    fetch("/api/sessions", { cache: "no-store" })
      .then(async (r) => {
        const payload = (await r.json().catch(() => null)) as SessionsResponseShape | null;
        if (!active) return;
        if (!r.ok || !payload) return;
        setSessions(normalizeSessions(payload));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [open]);

  // Filter results based on search
  const filteredTasks = useMemo(() => {
    if (!search || search.length < 2) return [];
    const lowerSearch = search.toLowerCase();
    return tasks
      .filter((t) =>
        t.title.toLowerCase().includes(lowerSearch) ||
        t.id.toLowerCase().includes(lowerSearch)
      )
      .slice(0, 8);
  }, [tasks, search]);

  const filteredAgents = useMemo(() => {
    if (!search || search.length < 2) return [];
    const lowerSearch = search.toLowerCase();
    return agents
      .filter((agent) =>
        agent.name.toLowerCase().includes(lowerSearch) ||
        agent.id.toLowerCase().includes(lowerSearch) ||
        agent.role.toLowerCase().includes(lowerSearch)
      )
      .slice(0, 8);
  }, [agents, search]);

  const filteredActivity = useMemo(() => {
    if (!search || search.length < 2) return [];
    const lowerSearch = search.toLowerCase();
    return activity
      .filter((a) => a.message.toLowerCase().includes(lowerSearch))
      .slice(0, 5);
  }, [activity, search]);

  const filteredDocuments = useMemo(() => {
    if (!search || search.length < 2) return [];
    const lowerSearch = search.toLowerCase();
    return documents
      .filter((doc) =>
        doc.title.toLowerCase().includes(lowerSearch) ||
        doc.content.toLowerCase().includes(lowerSearch) ||
        doc.id.toLowerCase().includes(lowerSearch) ||
        (doc.taskId ?? "").toLowerCase().includes(lowerSearch)
      )
      .slice(0, 8);
  }, [documents, search]);

  const filteredAgentMessages = useMemo(() => {
    if (!search || search.length < 2) return [];
    const lowerSearch = search.toLowerCase();

    return agentMessages
      .filter((msg) => {
        if (msg.content.toLowerCase().includes(lowerSearch)) return true;
        if (msg.fromAgentId.toLowerCase().includes(lowerSearch)) return true;
        if ((msg.toAgentId ?? "").toLowerCase().includes(lowerSearch)) return true;
        if ((msg.taskId ?? "").toLowerCase().includes(lowerSearch)) return true;

        const fromName = agentsById.get(msg.fromAgentId)?.name ?? "";
        const toName = msg.toAgentId ? agentsById.get(msg.toAgentId)?.name ?? "" : "";
        return (
          fromName.toLowerCase().includes(lowerSearch) ||
          toName.toLowerCase().includes(lowerSearch)
        );
      })
      .slice(0, 8);
  }, [agentMessages, agentsById, search]);

  const filteredFiles = useMemo(() => {
    if (!search || search.length < 2) return [];
    const lowerSearch = search.toLowerCase();
    return files
      .filter(f => f.name.toLowerCase().includes(lowerSearch) || f.path.toLowerCase().includes(lowerSearch))
      .slice(0, 8);
  }, [files, search]);

  const filteredSessions = useMemo(() => {
    if (!search || search.length < 2) return [];
    const lowerSearch = search.toLowerCase();

    return sessions
      .filter((session) => {
        const agentId = extractSessionAgentId(session) ?? "";
        const agentName = agentId ? agentsById.get(agentId)?.name ?? "" : "";
        return (
          session.id.toLowerCase().includes(lowerSearch) ||
          (session.key ?? "").toLowerCase().includes(lowerSearch) ||
          agentId.toLowerCase().includes(lowerSearch) ||
          agentName.toLowerCase().includes(lowerSearch) ||
          (session.model ?? "").toLowerCase().includes(lowerSearch) ||
          (session.status ?? "").toLowerCase().includes(lowerSearch)
        );
      })
      .slice(0, 8);
  }, [agentsById, search, sessions]);

  const filteredCron = useMemo(() => {
    if (!search || search.length < 2) return [];
    const lowerSearch = search.toLowerCase();
    return cronJobs
      .filter(j => (j.name ?? j.id ?? "").toLowerCase().includes(lowerSearch) || (j.cron ?? j.schedule ?? "").includes(lowerSearch))
      .slice(0, 5);
  }, [cronJobs, search]);

  const filteredNavigationTabs = useMemo(() => {
    if (!search || search.length < 2) return [];
    const lowerSearch = search.toLowerCase();
    const items = [
      { label: "Automations", tab: "tasks", icon: "tasks" as const },
      { label: "Dispatch", tab: "dispatch", icon: "send" as const },
      { label: "Messages", tab: "comms", icon: "message" as const },
      { label: "Live", tab: "monitor", icon: "activity" as const },
      { label: "Schedules", tab: "operations", icon: "clock" as const },
      { label: "Files", tab: "workspace", icon: "files" as const },
      { label: "Documents", tab: "documents", icon: "files" as const },
    ];

    return items
      .filter((item) =>
        item.label.toLowerCase().includes(lowerSearch) ||
        item.tab.toLowerCase().includes(lowerSearch)
      )
      .slice(0, 8);
  }, [search]);

  const filteredNavigationSettings = useMemo(() => {
    if (!search || search.length < 2) return [];
    const lowerSearch = search.toLowerCase();
    const items = [
      { label: "Connection Settings", href: "/settings?section=openclaw" },
      { label: "Agents", href: "/settings?section=agents" },
      { label: "Schedules · Sessions", href: "/settings?section=operations&ops=workers" },
      { label: "Schedules · Scheduled Jobs", href: "/settings?section=operations&ops=cron" },
      { label: "Health", href: "/settings?section=system" },
      { label: "Notifications", href: "/settings?section=notifications" },
    ];
    return items
      .filter((item) =>
        item.label.toLowerCase().includes(lowerSearch) ||
        item.href.toLowerCase().includes(lowerSearch)
      )
      .slice(0, 8);
  }, [search]);

  const filteredActions = useMemo(() => {
    if (!search || search.length < 2) return [];
    const lowerSearch = search.toLowerCase();
    const items = [
      { id: "new-task", label: "Create New Task", icon: "create" as const },
      { id: "system-health", label: "System Health", icon: "terminal" as const },
      { id: "refresh", label: "Refresh Data", icon: "refresh" as const },
    ];
    return items
      .filter((item) => item.label.toLowerCase().includes(lowerSearch))
      .slice(0, 8);
  }, [search]);

  // Stable callbacks (per rerender-functional-setstate rule)
  const handleClose = useCallback(() => {
    setSearch("");
    setOpen(false);
  }, [setOpen]);
  const handleOverlayClick = useCallback(() => handleClose(), [handleClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) {
          handleClose();
        } else {
          setOpen(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose, open, setOpen]);

  if (!open) return null;

  const hasSearchResults = search.length >= 2;

  return (
    <Command
      className="fixed inset-0 z-[100]"
      onKeyDown={(e) => {
        if (e.key === "Escape") handleClose();
      }}
      role="dialog"
      aria-label="Command palette"
      aria-modal="true"
    >
      {/* Overlay */}
      <div
        className="command-overlay animate-fade-in"
        onClick={handleOverlayClick}
        aria-hidden="true"
      />

      {/* Palette */}
      <div
        className="command-palette animate-in"
        style={{
          boxShadow:
            "0 24px 80px rgba(0, 0, 0, 0.6), 0 0 40px rgba(16, 163, 127, 0.08)",
        }}
      >
        <div className="command-input-wrapper">
          <MappedIcon name="search" size="sm" className="command-input-icon" />
          <CommandInput
            autoFocus
            value={search}
            onValueChange={setSearch}
            placeholder="Search tasks, agents, docs, messages, files..."
            className="command-input"
            aria-label="Search"
          />
          <kbd className="command-kbd" aria-hidden="true">esc</kbd>
        </div>

        <CommandList className="command-list">
          <CommandEmpty className="command-empty">
            <div className="text-2xl mb-2">
              <MappedIcon name="search" size="lg" />
            </div>
            <div style={{ color: "var(--text-muted)" }}>
              {hasSearchResults
                ? `No results found for "${search}"`
                : "Type at least 2 characters to search."}
            </div>
          </CommandEmpty>

          {/* Tasks */}
          {filteredTasks.length > 0 && (
            <CommandGroup heading="Tasks" className="command-group">
              <div className="command-group-heading">
                Tasks {hasSearchResults && `(${filteredTasks.length})`}
              </div>
              {filteredTasks.map((task) => {
                const assignee = task.assigneeId
                  ? agentsById.get(task.assigneeId)
                  : null;
                const statusIcon = STATUS_ICONS[task.status] || "tasks";
                const priorityColor = task.priority ? PRIORITY_COLORS[task.priority] : undefined;
                return (
                  <CommandItem
                    key={task.id}
                    value={`task-${task.id}-${task.title}`}
                    onSelect={() => {
                      router.push(`/tasks/${task.id}`);
                      handleClose();
                    }}
                    className="command-item"
                  >
                    <div className="command-item-left">
                      <div className="command-item-icon">
                        <MappedIcon name={statusIcon} size="sm" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="command-item-label">{task.title}</span>
                        <span
                          className="text-xs"
                          style={{ color: "var(--text-dim)" }}
                        >
                          {task.status.replace("_", " ")}
                          {assignee && ` • ${assignee.name}`}
                        </span>
                      </div>
                    </div>
                    {task.priority && priorityColor && (
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: priorityColor }}
                        aria-label={`Priority: ${task.priority}`}
                      />
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          {/* Agents */}
          {hasSearchResults && filteredAgents.length > 0 && (
            <CommandGroup heading="Agents" className="command-group">
              <div className="command-group-heading">Agents ({filteredAgents.length})</div>
              {filteredAgents.map((agent) => {
                const statusColor =
                  agent.status === "working"
                    ? "var(--accent-primary)"
                    : agent.status === "idle"
                      ? "var(--text-dim)"
                      : "var(--accent-error)";
                return (
                  <CommandItem
                    key={agent.id}
                    value={`agent-${agent.id}-${agent.name}-${agent.role}`}
                    onSelect={() => {
                      router.push(`/agents/${agent.id}`);
                      handleClose();
                    }}
                    className="command-item"
                  >
                    <div className="command-item-left">
                      <div className="flex flex-col gap-0.5">
                        <span className="command-item-label">{agent.name}</span>
                        <span
                          className="text-xs"
                          style={{ color: "var(--text-dim)" }}
                        >
                          {agent.role}
                        </span>
                      </div>
                    </div>
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: statusColor }}
                      aria-label={`Status: ${agent.status}`}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          {/* Documents */}
          {hasSearchResults && filteredDocuments.length > 0 && (
            <CommandGroup heading="Documents" className="command-group">
              <div className="command-group-heading">
                Documents ({filteredDocuments.length})
              </div>
              {filteredDocuments.map((doc) => {
                const isWorkspaceLinked =
                  doc.sourceKind === "workspace_file" &&
                  typeof doc.sourcePath === "string" &&
                  doc.sourcePath.trim().length > 0;

                const workspaceHref = (() => {
                  if (!isWorkspaceLinked) return null;
                  const parts = doc.sourcePath!.split("/").filter(Boolean);
                  const dirPath = parts.length <= 1 ? "." : parts.slice(0, -1).join("/");
                  const openParam = `&open=${encodeURIComponent(doc.sourcePath!)}`;
                  return `/?tab=workspace&path=${encodeURIComponent(dirPath)}${openParam}`;
                })();

                return (
                  <CommandItem
                    key={doc.id}
                    value={`document-${doc.id}-${doc.title}`}
                    onSelect={() => {
                      if (isWorkspaceLinked && workspaceHref) {
                        router.push(workspaceHref);
                      } else {
                        router.push(`/?tab=documents&doc=${encodeURIComponent(doc.id)}`);
                      }
                      handleClose();
                    }}
                    className="command-item"
                  >
                    <div className="command-item-left">
                      <div className="command-item-icon">
                        <MappedIcon name="files" size="sm" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="command-item-label">{doc.title}</span>
                        <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                          {doc.type}
                          {isWorkspaceLinked ? ` • ${doc.sourcePath}` : ""}
                          {doc.taskId ? ` • task ${doc.taskId}` : ""}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          {/* Conversations */}
          {hasSearchResults && filteredAgentMessages.length > 0 && (
            <CommandGroup heading="Conversations" className="command-group">
              <div className="command-group-heading">
                Conversations ({filteredAgentMessages.length})
              </div>
              {filteredAgentMessages.map((msg) => {
                const fromLabel = agentsById.get(msg.fromAgentId)?.name ?? msg.fromAgentId;
                const toLabel = msg.toAgentId
                  ? agentsById.get(msg.toAgentId)?.name ?? msg.toAgentId
                  : "Broadcast";
                const snippet =
                  msg.content.length > 70 ? `${msg.content.slice(0, 70)}...` : msg.content;

                return (
                  <CommandItem
                    key={msg.id}
                    value={`message-${msg.id}-${msg.fromAgentId}-${msg.toAgentId ?? "broadcast"}-${msg.content}`}
                    onSelect={() => {
                      const params = new URLSearchParams();
                      params.set("tab", "comms");
                      params.set("focusMessage", msg.id);
                      if (msg.taskId) params.set("chatTaskId", msg.taskId);

                      if (!msg.toAgentId) {
                        params.set("chat", "broadcast");
                      } else if (msg.fromAgentId === OPERATOR_ID) {
                        params.set("chat", "thread");
                        params.set("chatAgent", msg.toAgentId);
                      } else if (msg.toAgentId === OPERATOR_ID) {
                        params.set("chat", "thread");
                        params.set("chatAgent", msg.fromAgentId);
                      } else {
                        params.set("chat", "all");
                      }

                      router.push(`/?${params.toString()}`);
                      handleClose();
                    }}
                    className="command-item"
                  >
                    <div className="command-item-left">
                      <div className="command-item-icon">
                        <MappedIcon name="message" size="sm" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="command-item-label">{snippet}</span>
                        <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                          {fromLabel}
                          {msg.toAgentId ? " → " : " • "}
                          {toLabel}
                          {msg.taskId ? ` • task ${msg.taskId}` : ""}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                      {new Date(msg.createdAt).toLocaleTimeString()}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          {/* Sessions */}
          {hasSearchResults && filteredSessions.length > 0 && (
            <CommandGroup heading="Sessions" className="command-group">
              <div className="command-group-heading">
                Sessions ({filteredSessions.length})
              </div>
              {filteredSessions.map((session) => {
                const agentId = extractSessionAgentId(session);
                const agentLabel = agentId ? agentsById.get(agentId)?.name ?? agentId : "Unknown";
                const sessionKeyLabel = session.key ?? session.id;
                return (
                  <CommandItem
                    key={session.id}
                    value={`session-${session.id}-${session.key ?? ""}-${agentId ?? ""}`}
                    onSelect={() => {
                      router.push(`/?tab=operations&session=${encodeURIComponent(session.id)}`);
                      handleClose();
                    }}
                    className="command-item"
                  >
                    <div className="command-item-left">
                      <div className="command-item-icon">
                        <MappedIcon name="clock" size="sm" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="command-item-label">{agentLabel}</span>
                        <span className="text-xs font-mono" style={{ color: "var(--text-dim)" }}>
                          {sessionKeyLabel.length > 64 ? `${sessionKeyLabel.slice(0, 64)}...` : sessionKeyLabel}
                        </span>
                      </div>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          {/* Activity (only when searching) */}
          {hasSearchResults && filteredActivity.length > 0 && (
            <CommandGroup heading="Activity" className="command-group">
              <div className="command-group-heading">
                Activity ({filteredActivity.length})
              </div>
              {filteredActivity.map((item) => {
                const agent = item.agentId
                  ? agentsById.get(item.agentId)
                  : null;
                return (
                  <CommandItem
                    key={item.id}
                    value={`activity-${item.id}-${item.message}`}
                    onSelect={() => {
                      if (item.taskId) {
                        router.push(`/tasks/${item.taskId}`);
                      }
                      handleClose();
                    }}
                    className="command-item"
                  >
                    <div className="command-item-left">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className="command-item-label text-sm"
                          style={{ maxWidth: 400 }}
                        >
                          {item.message.length > 60
                            ? item.message.slice(0, 60) + "..."
                            : item.message}
                        </span>
                        <span
                          className="text-xs"
                          style={{ color: "var(--text-dim)" }}
                        >
                          {agent?.name || "System"} •{" "}
                          {new Date(item.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          {/* Files (only when searching) */}
          {hasSearchResults && filteredFiles.length > 0 && (
            <CommandGroup heading="Files" className="command-group">
              <div className="command-group-heading">Files ({filteredFiles.length})</div>
              {filteredFiles.map((file) => {
                const isDir = file.type === "dir";
                const dirPath = isDir
                  ? file.path
                  : (() => {
                      const parts = file.path.split("/").filter(Boolean);
                      if (parts.length <= 1) return ".";
                      return parts.slice(0, -1).join("/");
                    })();

                return (
                  <CommandItem
                    key={file.path}
                    value={`file-${file.path}`}
                    onSelect={() => {
                      const openParam = isDir ? "" : `&open=${encodeURIComponent(file.path)}`;
                      router.push(`/?tab=workspace&path=${encodeURIComponent(dirPath)}${openParam}`);
                      handleClose();
                    }}
                    className="command-item"
                  >
                    <div className="command-item-left">
                      <div className="command-item-icon">
                        <MappedIcon name={isDir ? "files" : "edit"} size="sm" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="command-item-label">{file.name}</span>
                        <span className="text-xs" style={{ color: "var(--text-dim)" }}>{file.path}</span>
                      </div>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          {/* Cron Jobs (only when searching) */}
          {hasSearchResults && filteredCron.length > 0 && (
            <CommandGroup heading="Scheduled Jobs" className="command-group">
              <div className="command-group-heading">Scheduled Jobs ({filteredCron.length})</div>
              {filteredCron.map((job, idx) => (
                <CommandItem
                  key={job.id ?? job.name ?? idx}
                  value={`cron-${job.id ?? job.name ?? idx}-${job.name ?? ""}`}
                  onSelect={() => {
                    router.push("/?tab=operations");
                    handleClose();
                  }}
                  className="command-item"
                >
                  <div className="command-item-left">
                    <div className="command-item-icon">
                      <MappedIcon name="clock" size="sm" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="command-item-label">{job.name ?? job.id ?? "Unnamed"}</span>
                      <span className="text-xs font-mono" style={{ color: "var(--text-dim)" }}>{job.cron ?? job.schedule ?? ""}</span>
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* Navigation */}
          <CommandGroup heading="Navigation" className="command-group">
            <div className="command-group-heading">Navigation</div>
            {/* Dashboard Tabs */}
            {[
              { label: "Automations", tab: "tasks", icon: "tasks" as const },
              { label: "Dispatch", tab: "dispatch", icon: "send" as const },
              { label: "Messages", tab: "comms", icon: "message" as const },
              { label: "Live", tab: "monitor", icon: "activity" as const },
              { label: "Schedules", tab: "operations", icon: "clock" as const },
              { label: "Files", tab: "workspace", icon: "files" as const },
            ].map((item) => (
              <CommandItem
                key={`nav-tab-${item.tab}`}
                value={`nav-tab-${item.tab}-${item.label}`}
                onSelect={() => {
                  router.push(`/?tab=${item.tab}`);
                  handleClose();
                }}
                className="command-item"
              >
                <div className="command-item-left">
                  <div className="command-item-icon">
                    <MappedIcon name={item.icon} size="sm" />
                  </div>
                  <span className="command-item-label">{item.label}</span>
                </div>
              </CommandItem>
            ))}
            {/* Settings */}
            {[
              { label: "Connection Settings", href: "/settings?section=openclaw" },
              { label: "Agents", href: "/settings?section=agents" },
              { label: "Schedules · Sessions", href: "/settings?section=operations&ops=workers" },
              { label: "Schedules · Scheduled Jobs", href: "/settings?section=operations&ops=cron" },
              { label: "Health", href: "/settings?section=system" },
              { label: "Notifications", href: "/settings?section=notifications" },
            ].map((item) => (
              <CommandItem
                key={`nav-settings-${item.href}`}
                value={`nav-settings-${item.href}-${item.label}`}
                onSelect={() => {
                  router.push(item.href);
                  handleClose();
                }}
                className="command-item"
              >
                <div className="command-item-left">
                  <div className="command-item-icon">
                    <MappedIcon name="settings" size="sm" />
                  </div>
                  <span className="command-item-label">{item.label}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>

          {/* Actions */}
          <CommandGroup heading="Actions" className="command-group">
            <div className="command-group-heading">Actions</div>
            <CommandItem
              value="action-new-task"
              onSelect={() => {
                onNewTask();
                handleClose();
              }}
              className="command-item"
            >
              <div className="command-item-left">
                <div className="command-item-icon">
                  <MappedIcon name="create" size="sm" />
                </div>
                <span className="command-item-label">Create New Task</span>
              </div>
              <div className="command-item-shortcut" aria-hidden="true">
                <kbd className="command-kbd">⌘</kbd>
                <kbd className="command-kbd">N</kbd>
              </div>
            </CommandItem>
            <CommandItem
              value="action-system-health"
              onSelect={() => {
                router.push("/?tab=monitor");
                handleClose();
              }}
              className="command-item"
            >
              <div className="command-item-left">
                <div className="command-item-icon">
                  <MappedIcon name="terminal" size="sm" />
                </div>
                <span className="command-item-label">System Health</span>
              </div>
            </CommandItem>
            <CommandItem
              value="action-refresh"
              onSelect={() => {
                window.location.reload();
              }}
              className="command-item"
            >
              <div className="command-item-left">
                <div className="command-item-icon">
                  <MappedIcon name="refresh" size="sm" />
                </div>
                <span className="command-item-label">Refresh Data</span>
              </div>
              <div className="command-item-shortcut" aria-hidden="true">
                <kbd className="command-kbd">⌘</kbd>
                <kbd className="command-kbd">R</kbd>
              </div>
            </CommandItem>
          </CommandGroup>
        </CommandList>

        {/* Footer */}
        <div className="command-footer">
          <div className="command-footer-hints" aria-hidden="true">
            <span className="command-footer-hint">
              <kbd className="command-kbd">↑</kbd>
              <kbd className="command-kbd">↓</kbd>
              <span>navigate</span>
            </span>
            <span className="command-footer-hint">
              <kbd className="command-kbd">↵</kbd>
              <span>select</span>
            </span>
            <span className="command-footer-hint">
              <kbd className="command-kbd">esc</kbd>
              <span>close</span>
            </span>
          </div>
          <span className="command-footer-brand">
            <MappedIcon name="lightning" size="xs" />
            OpenClaw Mission Control
          </span>
        </div>
      </div>
    </Command>
  );
});
