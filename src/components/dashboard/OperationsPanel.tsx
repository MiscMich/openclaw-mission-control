"use client";

import { memo, useState } from "react";
import { BentoGrid, BentoItem } from "@/components/layout/BentoGrid";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { MappedIcon } from "@/components/ui";
import { WorkersPanel } from "@/components/settings/WorkersPanel";
import { CronJobsPanel } from "@/components/settings/CronJobsPanel";
import { CronCalendar } from "@/components/dashboard/CronCalendar";

type CronView = "list" | "calendar";

export const OperationsPanel = memo(function OperationsPanel() {
  const [cronView, setCronView] = useState<CronView>("list");

  return (
    <div style={{ overflow: "auto", padding: 16, height: "100%" }}>
      <BentoGrid columns={{ default: 1, lg: 12 }} gap="md" className="h-full">
        <BentoItem colSpan={{ default: 1, lg: 7 }} className="h-full min-h-[420px]">
          <GlassPanel padding="none" className="h-full overflow-auto">
            <WorkersPanel />
          </GlassPanel>
        </BentoItem>
        <BentoItem colSpan={{ default: 1, lg: 5 }} className="h-full min-h-[420px]">
          <GlassPanel padding="none" className="h-full overflow-hidden flex flex-col">
            {/* View toggle */}
            <div className="flex items-center justify-end px-4 pt-3 pb-0">
              <div
                className="inline-flex items-center gap-1 p-1 rounded-lg"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
              <button
                onClick={() => setCronView("list")}
                className={`btn btn-sm ${cronView === "list" ? "btn-secondary" : "btn-ghost"}`}
                aria-label="List view"
                title="List view"
                style={{ minWidth: 40, minHeight: 40, padding: 0 }}
              >
                <MappedIcon name="tasks" size="sm" />
              </button>
              <button
                onClick={() => setCronView("calendar")}
                className={`btn btn-sm ${cronView === "calendar" ? "btn-secondary" : "btn-ghost"}`}
                aria-label="Calendar view"
                title="Calendar view"
                style={{ minWidth: 40, minHeight: 40, padding: 0 }}
              >
                <MappedIcon name="clock" size="sm" />
              </button>
              </div>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-auto">
              {cronView === "list" ? <CronJobsPanel /> : <CronCalendar />}
            </div>
          </GlassPanel>
        </BentoItem>
      </BentoGrid>
    </div>
  );
});
