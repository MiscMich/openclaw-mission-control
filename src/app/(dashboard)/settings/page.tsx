import { OpenClawConfigPanel } from "@/components/settings/OpenClawConfigPanel";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { AgentsDirectoryPanel } from "@/components/settings/AgentsDirectoryPanel";
import { NotificationPreferencesPanel } from "@/components/settings/NotificationPreferencesPanel";
import { WorkersPanel } from "@/components/settings/WorkersPanel";
import { CronJobsPanel } from "@/components/settings/CronJobsPanel";
import { SystemMonitoringPanel } from "@/components/settings/SystemMonitoringPanel";
import Link from "next/link";

type SettingsSection =
  | "openclaw"
  | "agents"
  | "operations"
  | "system"
  | "notifications";

function normalizeSection(value: string | null): SettingsSection {
  if (value === "agents") return "agents";
  if (value === "operations") return "operations";
  if (value === "system") return "system";
  if (value === "notifications") return "notifications";
  return "openclaw";
}

type SettingsPageProps = {
  searchParams: Promise<{ section?: string | string[]; ops?: string | string[] }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams;
  const rawSection = Array.isArray(params.section) ? params.section[0] : params.section;
  const rawOps = Array.isArray(params.ops) ? params.ops[0] : params.ops;
  const section = normalizeSection(rawSection ?? null);
  const opsView = rawOps === "cron" ? "cron" : "workers";

  return (
    <div className="space-y-4">
      {section === "openclaw" && (
        <div className="space-y-4">
          <SettingsPanel />
          <OpenClawConfigPanel />
        </div>
      )}
      {section === "agents" && <AgentsDirectoryPanel />}
      {section === "operations" && (
        <div className="space-y-4">
          <div className="section-card">
            <div className="section-body flex items-center gap-2">
              <Link
                href="/settings?section=operations&ops=workers"
                className={`btn btn-sm ${opsView === "workers" ? "btn-secondary" : "btn-ghost"}`}
              >
                Sessions
              </Link>
              <Link
                href="/settings?section=operations&ops=cron"
                className={`btn btn-sm ${opsView === "cron" ? "btn-secondary" : "btn-ghost"}`}
              >
                Scheduled Jobs
              </Link>
            </div>
          </div>
          {opsView === "workers" ? <WorkersPanel /> : <CronJobsPanel />}
        </div>
      )}
      {section === "system" && <SystemMonitoringPanel />}
      {section === "notifications" && <NotificationPreferencesPanel />}
    </div>
  );
}
