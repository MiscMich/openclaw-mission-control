"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convexApi";
import { toast } from "sonner";

export function SettingsPanel() {
  const settings = useQuery(api.settings.list, {});
  const setSetting = useMutation(api.settings.set);
  const [gatewayUrl, setGatewayUrl] = useState("");
  const [openclawCli, setOpenclawCli] = useState("openclaw");
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [token, setToken] = useState("");
  const [eventStreamEnabled, setEventStreamEnabled] = useState(true);
  const [skillsRoot, setSkillsRoot] = useState("skills");
  const [saving, setSaving] = useState(false);

  const map = useMemo(() => {
    const result = new Map<string, unknown>();
    settings?.forEach((s) => result.set(s.key, s.value));
    return result;
  }, [settings]);

  useEffect(() => {
    if (!settings) return;

    const gateway = map.get("openclawGatewayUrl");
    const cli = map.get("openclawCli");
    const workspace = map.get("workspaceRoot");
    const tokenValue = map.get("openclawToken");
    const eventStream = map.get("eventStreamEnabled");
    const skills = map.get("skillsRoot");

    setGatewayUrl(typeof gateway === "string" ? gateway : "http://127.0.0.1:18789");
    setOpenclawCli(typeof cli === "string" && cli.trim() ? cli : "openclaw");
    setWorkspaceRoot(typeof workspace === "string" ? workspace : "");
    setToken(typeof tokenValue === "string" ? tokenValue : "");
    setEventStreamEnabled(typeof eventStream === "boolean" ? eventStream : true);
    setSkillsRoot(typeof skills === "string" ? skills : "skills");
  }, [settings, map]);

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all([
        setSetting({ key: "openclawGatewayUrl", value: gatewayUrl }),
        setSetting({ key: "openclawCli", value: openclawCli }),
        setSetting({ key: "workspaceRoot", value: workspaceRoot }),
        setSetting({ key: "openclawToken", value: token }),
        setSetting({ key: "eventStreamEnabled", value: eventStreamEnabled }),
        setSetting({ key: "skillsRoot", value: skillsRoot }),
      ]);
      toast.success("Settings saved");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to save settings", error);
      toast.error("Failed to save settings", { description: errorMessage });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="section-card">
      <div className="section-header">
        <h2 className="section-title">Connection & Storage</h2>
        <button className="btn btn-secondary btn-sm" onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
      <div className="section-body space-y-4">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Tell OpenClaw Mission Control where to connect, where to keep work folders, and how to find shared tools.
        </p>
        <div>
          <label className="text-xs" htmlFor="gateway-url" style={{ color: "var(--text-dim)" }}>
            Connection URL
          </label>
          <input
            id="gateway-url"
            name="openclawGatewayUrl"
            autoComplete="url"
            className="input mt-2"
            value={gatewayUrl}
            onChange={(e) => setGatewayUrl(e.target.value)}
            placeholder="http://127.0.0.1:18789"
          />
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Usually the default when running locally. Change this only if your gateway runs elsewhere.
          </p>
        </div>
        <div>
          <label className="text-xs" htmlFor="openclaw-cli" style={{ color: "var(--text-dim)" }}>
            Local runner command
          </label>
          <input
            id="openclaw-cli"
            name="openclawCli"
            autoComplete="off"
            className="input mt-2"
            value={openclawCli}
            onChange={(e) => setOpenclawCli(e.target.value)}
            placeholder="openclaw"
          />
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Use a full path if you have multiple installs.
          </p>
        </div>
        <div>
          <label className="text-xs" htmlFor="workspace-root" style={{ color: "var(--text-dim)" }}>
            Work folder
          </label>
          <input
            id="workspace-root"
            name="workspaceRoot"
            autoComplete="off"
            className="input mt-2"
            value={workspaceRoot}
            onChange={(e) => setWorkspaceRoot(e.target.value)}
            placeholder="Set OPENCLAW_WORKSPACE_ROOT on the server"
          />
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            No home-directory fallback is used. Configure a dedicated server root before enabling workspace operations.
          </p>
        </div>
        <div>
          <label className="text-xs" htmlFor="openclaw-token" style={{ color: "var(--text-dim)" }}>
            Access token (optional)
          </label>
          <input
            id="openclaw-token"
            name="openclawToken"
            autoComplete="off"
            className="input mt-2"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Bearer token"
          />
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={eventStreamEnabled}
            onChange={(e) => setEventStreamEnabled(e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          <span style={{ color: "var(--text-secondary)" }}>
            Live updates (recommended)
          </span>
        </label>
        <div>
          <label className="text-xs" htmlFor="skills-root" style={{ color: "var(--text-dim)" }}>
            Shared tools folder (optional)
          </label>
          <input
            id="skills-root"
            name="skillsRoot"
            autoComplete="off"
            className="input mt-2"
            value={skillsRoot}
            onChange={(e) => setSkillsRoot(e.target.value)}
            placeholder="skills"
          />
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            If agents share a common tools folder, set it here. Per-agent tools still live in each agent folder.
          </p>
        </div>
      </div>
    </section>
  );
}
