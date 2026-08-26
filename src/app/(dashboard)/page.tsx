"use client";

import { Suspense, useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import { useHotkeys } from "@/hooks/useHotkeys";

import { AgentSidebar } from "@/components/layout/AgentSidebar";
import { AgentSlideIn } from "@/components/agents/AgentSlideIn";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { NewTaskModal } from "@/components/tasks/NewTaskModal";
import { GlassPanel, MappedIcon, type MappedIconName } from "@/components/ui";
import { BentoGrid, BentoItem } from "@/components/layout/BentoGrid";
import { DemoMissionControl } from "@/components/demo/DemoMissionControl";

const Header = dynamic(
  () => import("@/components/layout/Header").then((m) => m.Header),
  { ssr: false }
);

// Dynamically imported heavy components
const CommandPalette = dynamic(
  () => import("@/components/ui/CommandPalette").then((m) => m.CommandPalette),
  { ssr: false }
);
const WorkflowsPanel = dynamic(
  () => import("@/components/workflows/WorkflowsPanel").then((m) => m.WorkflowsPanel),
  { ssr: false, loading: () => <LoadingPanel label="Loading jobs…" /> }
);

function LoadingPanel({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="p-4 text-sm" style={{ color: "var(--text-muted)" }}>
      {label}
    </div>
  );
}

const AgentChat = dynamic(
  () => import("@/components/dashboard/AgentChat").then((m) => m.AgentChat),
  { ssr: false, loading: () => <LoadingPanel label="Loading chat…" /> }
);
const NotificationsCenter = dynamic(
  () => import("@/components/dashboard/NotificationsCenter").then((m) => m.NotificationsCenter),
  { ssr: false, loading: () => <LoadingPanel label="Loading notifications…" /> }
);
const StandupsPanel = dynamic(
  () => import("@/components/dashboard/StandupsPanel").then((m) => m.StandupsPanel),
  { ssr: false, loading: () => <LoadingPanel label="Loading standups…" /> }
);
const UsageDashboard = dynamic(
  () => import("@/components/dashboard/UsageDashboard").then((m) => m.UsageDashboard),
  { ssr: false, loading: () => <LoadingPanel label="Loading usage…" /> }
);
const ChartsPanel = dynamic(
  () => import("@/components/dashboard/Charts").then((m) => m.ChartsPanel),
  { ssr: false, loading: () => <LoadingPanel label="Loading charts…" /> }
);
const SwarmDashboard = dynamic(
  () => import("@/components/swarm/SwarmDashboard").then((m) => m.SwarmDashboard),
  { ssr: false, loading: () => <LoadingPanel label="Loading dispatch…" /> }
);
const LiveTerminal = dynamic(
  () => import("@/components/dashboard/LiveTerminal").then((m) => m.LiveTerminal),
  { ssr: false }
);
const OperationsPanel = dynamic(
  () => import("@/components/dashboard/OperationsPanel").then((m) => m.OperationsPanel),
  { ssr: false }
);
const FileManager = dynamic(
  () => import("@/components/files/FileManager").then((m) => m.FileManager),
  { ssr: false }
);
const DocumentsCenter = dynamic(
  () => import("@/components/dashboard/DocumentsCenter").then((m) => m.DocumentsCenter),
  { ssr: false }
);
const SystemHealthStrip = dynamic(
  () => import("@/components/dashboard/SystemHealthStrip").then((m) => m.SystemHealthStrip),
  { ssr: false }
);
const SystemMonitoringPanel = dynamic(
  () => import("@/components/settings/SystemMonitoringPanel").then((m) => m.SystemMonitoringPanel),
  { ssr: false }
);

// ─── Tab Configuration ───

type TabId =
  | "tasks"
  | "dispatch"
  | "comms"
  | "monitor"
  | "operations"
  | "workspace";

const TABS: { id: TabId; label: string; icon: MappedIconName }[] = [
  { id: "tasks", label: "Jobs", icon: "tasks" },
  { id: "dispatch", label: "Dispatch", icon: "send" },
  { id: "comms", label: "Messages", icon: "message" },
  { id: "monitor", label: "Live", icon: "activity" },
  { id: "operations", label: "Schedules", icon: "clock" },
  { id: "workspace", label: "Files", icon: "files" },
];

const TAB_HELP: Record<TabId, string> = {
  tasks: "Create and run multi-step jobs. Queue several jobs and run them in parallel.",
  dispatch: "Manually assign open tasks: drag a task onto an agent.",
  comms: "Talk to agents, read notifications, and review standups.",
  monitor: "See what is happening right now: live logs, usage, and charts.",
  operations: "See what is running in the background and what is scheduled.",
  workspace: "Browse and edit files and documents.",
};

function normalizeDashboardTab(value: string | null): TabId | null {
  if (value === "tasks") return "tasks";
  if (value === "dispatch") return "dispatch";
  // Legacy tab compatibility
  if (value === "swarm") return "dispatch";
  if (value === "comms") return "comms";
  if (value === "monitor") return "monitor";
  if (value === "operations") return "operations";
  if (value === "workspace") return "workspace";

  // Legacy sub-tab compatibility
  if (value === "chat" || value === "notifications" || value === "standups") return "comms";
  if (value === "terminal" || value === "charts" || value === "usage") return "monitor";
  if (value === "documents") return "workspace";
  if (value === "workers" || value === "cron") return "operations";

  return null;
}

// ─── Dashboard Content (uses useSearchParams) ───

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Get active tab from URL or default to "tasks"
  const rawTab = searchParams.get("tab");
  const activeTab = normalizeDashboardTab(rawTab) ?? "tasks";
  const focusedDocId = searchParams.get("doc") ?? undefined;

  const commsViewParam = searchParams.get("chat") ?? "";
  const commsView =
    commsViewParam === "all" || commsViewParam === "broadcast" || commsViewParam === "thread"
      ? commsViewParam
      : undefined;
  const commsAgentId = searchParams.get("chatAgent") ?? undefined;
  const commsTaskId = searchParams.get("chatTaskId") ?? undefined;
  const focusMessageId = searchParams.get("focusMessage") ?? undefined;

  const [openPalette, setOpenPalette] = useState(false);
  const [openTask, setOpenTask] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [healthExpanded, setHealthExpanded] = useState(false);
  const [commsSideTab, setCommsSideTab] = useState<"notifications" | "standups">(
    "notifications"
  );
  const openNewTask = useCallback(() => setOpenTask(true), []);
  const closeNewTask = useCallback(() => setOpenTask(false), []);
  const openCommandPalette = useCallback(() => setOpenPalette(true), []);
  const closeAgentSlideIn = useCallback(() => setSelectedAgentId(null), []);
  const handleAgentClick = useCallback((agentId: string) => setSelectedAgentId(agentId), []);
  const closeMobileSidebar = useCallback(() => setIsMobileSidebarOpen(false), []);
  const toggleMobileSidebar = useCallback(() => {
    setIsMobileSidebarOpen((prev) => !prev);
  }, []);
  const handleHealthExpandToggle = useCallback(() => {
    setHealthExpanded((prev) => !prev);
  }, []);
  const openSettings = useCallback(() => {
    router.push("/settings");
  }, [router]);

  // Function to update active tab in URL
  const setActiveTab = useCallback(
    (tabId: TabId) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tabId);
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [searchParams, router]
  );
  const handleNotificationsClick = useCallback(() => {
    setActiveTab("comms");
  }, [setActiveTab]);

  useEffect(() => {
    if (rawTab === "workers") {
      router.replace("/settings?section=operations&ops=workers");
      return;
    }
    if (rawTab === "cron") {
      router.replace("/settings?section=operations&ops=cron");
    }
  }, [rawTab, router]);

  // Keyboard shortcuts
  useHotkeys("mod+k", (e) => {
    e.preventDefault();
    openCommandPalette();
  });

  useHotkeys("mod+n", (e) => {
    e.preventDefault();
    openNewTask();
  });

  useHotkeys("c", () => {
    openNewTask();
  }, { enabled: !openTask && !openPalette });

  // Cmd+, opens the dedicated settings page.
  useHotkeys("mod+,", (e) => {
    e.preventDefault();
    router.push("/settings");
  });

  // ─── Workflows tab (replaces the kanban-centric Tasks tab) ───
  const isTasksTab = activeTab === "tasks";

  return (
    <div className="app-layout">
      <AgentSidebar
        onAgentClick={handleAgentClick}
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={closeMobileSidebar}
      />

      <Header
        onNewTask={openNewTask}
        onCommandPalette={openCommandPalette}
        onNotificationsClick={handleNotificationsClick}
        onSettingsClick={openSettings}
        isMobileSidebarOpen={isMobileSidebarOpen}
        onToggleMobileSidebar={toggleMobileSidebar}
      />

      <main className="main-content" id="main-content">
        <div className="dashboard-viewport">
          {/* Stats Strip — compact, always visible */}
          <div className="dashboard-header">
            <StatsBar />
          </div>

          {/* Tab Bar */}
          <div className="dashboard-tabs">
            <div className="dashboard-tabs-inner" role="tablist" aria-label="Dashboard tabs">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  className={`dashboard-tab ${activeTab === tab.id ? "active" : ""}`}
                  onClick={() => setActiveTab(tab.id)}
                  title={TAB_HELP[tab.id]}
                  role="tab"
                  aria-controls={`panel-${tab.id}`}
                  aria-selected={activeTab === tab.id}
                >
                  <MappedIcon name={tab.icon} size="sm" />
                  <span className="dashboard-tab-label">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="dashboard-tab-help" role="note">
            <MappedIcon name="info" size="xs" />
            <span className="dashboard-tab-help-text">{TAB_HELP[activeTab]}</span>
          </div>

          {/* Tab Content — fills remaining viewport */}
          <div className={`dashboard-body ${isTasksTab ? "dashboard-body--tasks" : ""}`}>
          {isTasksTab ? (
            /* ─── Workflows Tab: Self-advancing workflow runs (Ralph loop) ─── */
            <div
              id="panel-tasks"
              role="tabpanel"
              className="flex-1 h-full w-full min-w-0 flex flex-col min-h-0 overflow-x-hidden"
            >
              <GlassPanel padding="none" className="h-full min-h-0 w-full min-w-0 overflow-hidden flex flex-col">
                <WorkflowsPanel />
              </GlassPanel>
            </div>
          ) : (
          /* ─── Other Tabs: Full-width content panel ─── */
          <div className="dashboard-content" id={`panel-${activeTab}`} role="tabpanel">
            <div className="content-panel neu-card">
              {activeTab === "dispatch" && (
                <div style={{ overflow: "auto", padding: 24, height: "100%" }}>
                  <SwarmDashboard onAgentClick={(agentId) => setSelectedAgentId(agentId)} />
                </div>
              )}
              {activeTab === "comms" && (
                <div className="h-full min-h-0 overflow-auto lg:overflow-hidden p-3 lg:p-4">
                  <div className="h-full min-h-0 flex flex-col lg:flex-row gap-4">
                    <div className="flex-1 min-w-0 min-h-[560px] lg:min-h-0">
                      <GlassPanel padding="none" className="h-full min-h-0 overflow-hidden flex flex-col">
                        <AgentChat
                          currentAgentId={commsAgentId}
                          taskId={commsTaskId}
                          initialViewMode={commsView}
                          focusMessageId={focusMessageId}
                        />
                      </GlassPanel>
                    </div>

                    <div className="w-full lg:w-[420px] xl:w-[460px] min-h-[520px] lg:min-h-0 min-w-0">
                      <GlassPanel padding="none" className="h-full min-h-0 overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between gap-2 p-3 border-b border-[var(--hairline)] bg-[rgba(255,255,255,0.02)]">
                          <div
                            className="inline-flex items-center gap-1 p-1 rounded-lg"
                            style={{
                              background: "var(--bg-elevated)",
                              border: "1px solid var(--border-subtle)",
                            }}
                            role="tablist"
                            aria-label="Messages side panels"
                          >
                            <button
                              type="button"
                              className={`btn btn-sm ${commsSideTab === "notifications" ? "btn-secondary" : "btn-ghost"}`}
                              onClick={() => setCommsSideTab("notifications")}
                              role="tab"
                              aria-selected={commsSideTab === "notifications"}
                              aria-controls="comms-side-notifications"
                              style={{ minHeight: 36 }}
                            >
                              <MappedIcon name="notification" size="sm" />
                              <span>Notifications</span>
                            </button>
                            <button
                              type="button"
                              className={`btn btn-sm ${commsSideTab === "standups" ? "btn-secondary" : "btn-ghost"}`}
                              onClick={() => setCommsSideTab("standups")}
                              role="tab"
                              aria-selected={commsSideTab === "standups"}
                              aria-controls="comms-side-standups"
                              style={{ minHeight: 36 }}
                            >
                              <MappedIcon name="chart" size="sm" />
                              <span>Standups</span>
                            </button>
                          </div>
                        </div>

                        <div className="flex-1 min-h-0 overflow-hidden">
                          {commsSideTab === "notifications" ? (
                            <div id="comms-side-notifications" role="tabpanel" className="h-full">
                              <NotificationsCenter />
                            </div>
                          ) : (
                            <div id="comms-side-standups" role="tabpanel" className="h-full">
                              <StandupsPanel />
                            </div>
                          )}
                        </div>
                      </GlassPanel>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === "monitor" && (
                <div style={{ overflow: "auto", padding: 16, height: "100%" }}>
                  <SystemHealthStrip
                    onExpandToggle={handleHealthExpandToggle}
                    isExpanded={healthExpanded}
                  />
                  {healthExpanded && (
                    <div className="mb-4">
                      <SystemMonitoringPanel />
                    </div>
                  )}
                  <BentoGrid columns={{ default: 1, lg: 12 }} gap="md" className="h-full">
                    <BentoItem colSpan={{ default: 1, lg: 7 }} className="h-full min-h-[420px]">
                      <GlassPanel padding="none" className="h-full overflow-hidden flex flex-col">
                        <LiveTerminal />
                      </GlassPanel>
                    </BentoItem>
                    <BentoItem colSpan={{ default: 1, lg: 5 }} className="h-full min-h-[420px]">
                      <GlassPanel padding="none" className="h-full overflow-auto">
                        <UsageDashboard />
                      </GlassPanel>
                    </BentoItem>
                    <BentoItem colSpan={{ default: 1, lg: 12 }} className="min-h-[320px]">
                      <GlassPanel padding="none" className="h-full overflow-auto">
                        <ChartsPanel />
                      </GlassPanel>
                    </BentoItem>
                  </BentoGrid>
                </div>
              )}
              {activeTab === "operations" && (
                <OperationsPanel />
              )}
              {activeTab === "workspace" && (
                <div style={{ height: "100%", overflow: "auto" }}>
                  {rawTab === "documents" ? (
                    <DocumentsCenter initialSelectedId={focusedDocId} />
                  ) : (
                    <FileManager />
                  )}
                </div>
              )}
            </div>
          </div>
        )}
          </div>{/* end dashboard-body */}
        </div>{/* end dashboard-viewport */}
      </main>

      <CommandPalette open={openPalette} setOpen={setOpenPalette} onNewTask={openNewTask} />
      <NewTaskModal open={openTask} onClose={closeNewTask} />
      <AgentSlideIn
        agentId={selectedAgentId}
        onClose={closeAgentSlideIn}
      />
    </div>
  );
}

// ─── Main Component (Suspense removed for progressive loading) ───

export default function Home() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true" || !process.env.NEXT_PUBLIC_CONVEX_URL;
  if (demoMode) return <DemoMissionControl />;

  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center px-6"
          style={{ background: "var(--bg-void)" }}
        >
          <div
            className="w-full max-w-sm rounded-xl p-6"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Loading OpenClaw Mission Control…
            </div>
          </div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
