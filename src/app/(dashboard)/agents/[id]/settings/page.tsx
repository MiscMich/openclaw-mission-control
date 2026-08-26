"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AgentSidebar } from "@/components/layout/AgentSidebar";

// Dynamically import CommandPalette - only loaded when ⌘K pressed (bundle-dynamic-imports optimization)
const CommandPalette = dynamic(
  () => import("@/components/ui/CommandPalette").then((m) => m.CommandPalette),
  { ssr: false }
);
import { NewTaskModal } from "@/components/tasks/NewTaskModal";
import { AgentSettingsPanelV2 } from "@/components/settings/AgentSettingsPanelV2";

export default function AgentSettingsPage() {
  const params = useParams();
  const agentId = params?.id as string;
  const [openPalette, setOpenPalette] = useState(false);
  const [openTask, setOpenTask] = useState(false);

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
      <AgentSidebar />
      <main className="main-content">
        <div className="main-content-inner">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <Link 
                href={`/agents/${agentId}`} 
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
                Agent
              </Link>
              <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                Agent Settings
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/settings?section=agents"
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
                Global Settings
              </Link>
              <Link
                href={`/agents/${agentId}`}
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
                Overview
              </Link>
              <span
                className="rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{
                  color: "var(--text-primary)",
                  border: "1px solid var(--accent-strong)",
                  background: "var(--accent-soft)",
                }}
              >
                Settings
              </span>
            </div>
          </div>
          <AgentSettingsPanelV2 agentId={agentId} />
        </div>
      </main>
      <CommandPalette open={openPalette} setOpen={setOpenPalette} onNewTask={() => setOpenTask(true)} />
      <NewTaskModal open={openTask} onClose={() => setOpenTask(false)} />
    </div>
  );
}
