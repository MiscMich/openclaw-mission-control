"use client";

import { useState, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { MappedIcon, type MappedIconName } from "@/components/ui";
import { AgentSidebar } from "@/components/layout/AgentSidebar";
import { cn } from "@/lib/utils";

const Header = dynamic(
  () => import("@/components/layout/Header").then((m) => m.Header),
  { ssr: false }
);
const CommandPalette = dynamic(
  () => import("@/components/ui/CommandPalette").then((m) => m.CommandPalette),
  { ssr: false }
);
import { NewTaskModal } from "@/components/tasks/NewTaskModal";

type SettingsRoute = {
  section: string;
  label: string;
  icon: MappedIconName;
};

const SETTINGS_ROUTES: SettingsRoute[] = [
  { section: "openclaw", label: "Connection", icon: "link" },
  { section: "agents", label: "Agents", icon: "agents" },
  { section: "operations", label: "Schedules", icon: "clock" },
  { section: "system", label: "Health", icon: "activity" },
  { section: "notifications", label: "Notifications", icon: "notification" },
];

function SettingsNavigation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const section = searchParams.get("section") ?? "openclaw";

  const legacyPathSections: Record<string, string> = {
    "/settings/openclaw": "openclaw",
    "/settings/agents": "agents",
    "/settings/notifications": "notifications",
    "/settings/system": "system",
    "/settings/workers": "operations",
    "/settings/cron": "operations",
  };
  const sectionFromLegacyPath = legacyPathSections[pathname];

  return (
    <nav className="settings-nav" role="navigation" aria-label="Settings navigation">
      {SETTINGS_ROUTES.map((route) => {
        const legacyPathActive = sectionFromLegacyPath === route.section;
        const isActive =
          (pathname === "/settings" && section === route.section) || legacyPathActive;
        const href =
          route.section === "operations"
            ? "/settings?section=operations&ops=workers"
            : `/settings?section=${route.section}`;
        return (
          <Link
            key={route.section}
            href={href}
            className={cn("settings-nav-item", isActive && "active")}
            aria-current={isActive ? "page" : undefined}
          >
            <MappedIcon name={route.icon} size="sm" />
            <span>{route.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function SettingsNavigationFallback() {
  return (
    <nav className="settings-nav" role="navigation" aria-label="Settings navigation">
      {SETTINGS_ROUTES.map((route) => (
        <Link
          key={route.section}
          href={`/settings?section=${route.section}`}
          className={cn("settings-nav-item", route.section === "openclaw" && "active")}
          aria-current={route.section === "openclaw" ? "page" : undefined}
        >
          <MappedIcon name={route.icon} size="sm" />
          <span>{route.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [openPalette, setOpenPalette] = useState(false);
  const [openTask, setOpenTask] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpenPalette(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setOpenTask(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app-layout">
      <AgentSidebar
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
      />
      <Header
        onNewTask={() => setOpenTask(true)}
        onCommandPalette={() => setOpenPalette(true)}
        isMobileSidebarOpen={isMobileSidebarOpen}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
      />
      <main className="main-content">
        <div className="main-content-inner">
          <div className="settings-layout">
            {/* Back + Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-4">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-transparent"
                  style={{
                    color: "var(--text-muted)",
                    transition: "all var(--duration-fast)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--text-primary)";
                    e.currentTarget.style.background = "var(--bg-hover)";
                    e.currentTarget.style.borderColor = "var(--hairline)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--text-muted)";
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.borderColor = "transparent";
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                  Dashboard
                </Link>
                <div>
                  <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                    Settings
                  </h1>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    Set up connections, tune agents, manage schedules, and notifications
                  </p>
                </div>
              </div>
            </div>

            {/* Layout: Sidebar + Content */}
            <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
              <Suspense fallback={<SettingsNavigationFallback />}>
                <SettingsNavigation />
              </Suspense>
              <div className="settings-content min-w-0">{children}</div>
            </div>
          </div>
        </div>
      </main>

      <CommandPalette open={openPalette} setOpen={setOpenPalette} onNewTask={() => setOpenTask(true)} />
      <NewTaskModal open={openTask} onClose={() => setOpenTask(false)} />

      <style jsx>{`
        .settings-layout {
          max-width: 1400px;
        }

        .settings-nav {
          display: flex;
          flex-direction: column;
          gap: 4px;
          position: sticky;
          top: 24px;
          align-self: start;
        }

        :global(.settings-nav-item) {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: var(--radius-md);
          color: var(--text-muted);
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          transition: all var(--duration-fast);
          border: 1px solid transparent;
        }

        :global(.settings-nav-item:hover) {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        :global(.settings-nav-item.active) {
          background: var(--accent-soft);
          color: var(--accent-primary);
          border-color: var(--accent-strong);
          box-shadow: 0 0 0 1px var(--accent-primary);
        }

        @media (max-width: 1024px) {
          .settings-nav {
            position: relative;
            top: 0;
            flex-direction: row;
            overflow-x: auto;
            padding-bottom: 8px;
          }

          :global(.settings-nav-item) {
            white-space: nowrap;
            flex-shrink: 0;
          }
        }
      `}</style>
    </div>
  );
}
