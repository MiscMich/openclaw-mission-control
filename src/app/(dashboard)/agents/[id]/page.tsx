"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AgentSidebar } from "@/components/layout/AgentSidebar";
import { AgentDetail } from "@/components/agents/AgentDetail";

const Header = dynamic(
  () => import("@/components/layout/Header").then((m) => m.Header),
  { ssr: false }
);

// Dynamically import CommandPalette - only loaded when ⌘K pressed (bundle-dynamic-imports optimization)
const CommandPalette = dynamic(
  () => import("@/components/ui/CommandPalette").then((m) => m.CommandPalette),
  { ssr: false }
);
import { NewTaskModal } from "@/components/tasks/NewTaskModal";

export default function AgentPage() {
  const params = useParams();
  const agentId = params?.id as string;
  const [openPalette, setOpenPalette] = useState(false);
  const [openTask, setOpenTask] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Global keyboard shortcuts
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
      {/* Left Agent Sidebar */}
      <AgentSidebar
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
      />
      
      {/* Header */}
      <Header
        onNewTask={() => setOpenTask(true)}
        onCommandPalette={() => setOpenPalette(true)}
        isMobileSidebarOpen={isMobileSidebarOpen}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
      />

      {/* Main Content Area */}
      <main className="main-content">
        <div className="main-content-inner">
          {/* Breadcrumb */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-transparent"
              style={{ 
                color: "var(--text-muted)",
                transition: "all var(--transition-fast)"
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
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              Dashboard
            </Link>
            <div className="flex items-center gap-2">
              <span
                className="rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{
                  color: "var(--text-primary)",
                  border: "1px solid var(--accent-strong)",
                  background: "var(--accent-soft)",
                }}
              >
                Overview
              </span>
              <Link
                href={`/agents/${agentId}/settings`}
                className="rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{
                  color: "var(--text-dim)",
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-elevated)",
                  transition: "all var(--transition-fast)"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--text-secondary)";
                  e.currentTarget.style.borderColor = "var(--chrome)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-dim)";
                  e.currentTarget.style.borderColor = "var(--border-subtle)";
                }}
              >
                Settings
              </Link>
            </div>
          </div>
          
          {/* Agent Detail */}
          <AgentDetail agentId={agentId} />
        </div>
      </main>
      
      {/* Modals */}
      <CommandPalette 
        open={openPalette} 
        setOpen={setOpenPalette} 
        onNewTask={() => setOpenTask(true)} 
      />
      <NewTaskModal 
        open={openTask} 
        onClose={() => setOpenTask(false)} 
      />
    </div>
  );
}
