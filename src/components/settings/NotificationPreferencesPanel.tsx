"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Button } from "@/components/ui";
import { toast } from "sonner";
import { api } from "@/lib/convexApi";

type NotificationPreferences = {
  soundEnabled: boolean;
  desktopEnabled: boolean;
  agentUpdates: boolean;
  taskUpdates: boolean;
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  soundEnabled: true,
  desktopEnabled: false,
  agentUpdates: true,
  taskUpdates: true,
};

function normalizePreferences(value: unknown): NotificationPreferences {
  const raw =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  return {
    soundEnabled:
      typeof raw.soundEnabled === "boolean"
        ? raw.soundEnabled
        : DEFAULT_PREFERENCES.soundEnabled,
    desktopEnabled:
      typeof raw.desktopEnabled === "boolean"
        ? raw.desktopEnabled
        : DEFAULT_PREFERENCES.desktopEnabled,
    agentUpdates:
      typeof raw.agentUpdates === "boolean"
        ? raw.agentUpdates
        : DEFAULT_PREFERENCES.agentUpdates,
    taskUpdates:
      typeof raw.taskUpdates === "boolean"
        ? raw.taskUpdates
        : DEFAULT_PREFERENCES.taskUpdates,
  };
}

export function NotificationPreferencesPanel() {
  const stored = useQuery(api.settings.get, { key: "notificationPreferences" });
  const saveSetting = useMutation(api.settings.set);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    if (!stored) return;
    setPrefs(normalizePreferences(stored.value));
  }, [stored]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await saveSetting({
        key: "notificationPreferences",
        value: prefs,
      });
      toast.success("Notification preferences saved");
    } catch (error) {
      toast.error("Failed to save notification preferences");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="section-card">
      <div className="section-header">
        <h2 className="section-title">Notification Preferences</h2>
      </div>
      <div className="section-body space-y-4">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Configure how you receive notifications from OpenClaw Mission Control.
        </p>

        <div className="space-y-4 pt-2">
          <label className="flex items-center justify-between py-3 border-b border-[var(--border-subtle)]">
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Sound Notifications
              </div>
              <div className="text-xs" style={{ color: "var(--text-dim)" }}>
                Play sound when agents complete tasks
              </div>
            </div>
            <input
              type="checkbox"
              checked={prefs.soundEnabled}
              onChange={(e) =>
                setPrefs((prev) => ({ ...prev, soundEnabled: e.target.checked }))
              }
              className="w-4 h-4"
            />
          </label>

          <label className="flex items-center justify-between py-3 border-b border-[var(--border-subtle)]">
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Desktop Notifications
              </div>
              <div className="text-xs" style={{ color: "var(--text-dim)" }}>
                Show system notifications for important events
              </div>
            </div>
            <input
              type="checkbox"
              checked={prefs.desktopEnabled}
              onChange={(e) =>
                setPrefs((prev) => ({ ...prev, desktopEnabled: e.target.checked }))
              }
              className="w-4 h-4"
            />
          </label>

          <label className="flex items-center justify-between py-3 border-b border-[var(--border-subtle)]">
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Agent Status Updates
              </div>
              <div className="text-xs" style={{ color: "var(--text-dim)" }}>
                Notify when agents go online or offline
              </div>
            </div>
            <input
              type="checkbox"
              checked={prefs.agentUpdates}
              onChange={(e) =>
                setPrefs((prev) => ({ ...prev, agentUpdates: e.target.checked }))
              }
              className="w-4 h-4"
            />
          </label>

          <label className="flex items-center justify-between py-3">
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Task Updates
              </div>
              <div className="text-xs" style={{ color: "var(--text-dim)" }}>
                Notify on task status changes
              </div>
            </div>
            <input
              type="checkbox"
              checked={prefs.taskUpdates}
              onChange={(e) =>
                setPrefs((prev) => ({ ...prev, taskUpdates: e.target.checked }))
              }
              className="w-4 h-4"
            />
          </label>
        </div>

        <div className="flex justify-end pt-3">
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Preferences"}
          </Button>
        </div>
      </div>
    </section>
  );
}

export default NotificationPreferencesPanel;
