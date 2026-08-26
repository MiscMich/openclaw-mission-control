"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convexApi";
import { ConfirmDialog } from "@/components/ui";
import { toast } from "sonner";

const DEFAULT_OPENCLAW_CONFIG_PATH = "openclaw.json";

export function OpenClawConfigPanel() {
  const configPathSetting = useQuery(api.settings.get, { key: "openclawConfigPath" });
  const setSetting = useMutation(api.settings.set);
  const [configPath, setConfigPath] = useState(DEFAULT_OPENCLAW_CONFIG_PATH);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyConfirmOpen, setApplyConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<string | null>(null);

  useEffect(() => {
    if (typeof configPathSetting?.value === "string" && configPathSetting.value.trim()) {
      const normalizedPath =
        configPathSetting.value === "config/openclaw.json"
          ? DEFAULT_OPENCLAW_CONFIG_PATH
          : configPathSetting.value;
      setConfigPath(normalizedPath);
    }
  }, [configPathSetting]);

  const load = async () => {
    setLoading(true);
    setError(null);
    setValidation(null);
    try {
      await setSetting({ key: "openclawConfigPath", value: configPath });
      const res = await fetch(`/api/openclaw/file?path=${encodeURIComponent(configPath)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Failed to load config");
      setContent(data.content ?? "");
      if (configPath.endsWith(".json") && data.content) {
        try {
          JSON.parse(data.content);
          setValidation("Valid JSON");
        } catch {
          setValidation("Invalid JSON");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    await setSetting({ key: "openclawConfigPath", value: configPath });
    if (configPath.endsWith(".json")) {
      JSON.parse(content || "{}");
      setValidation("Valid JSON");
    }
    const res = await fetch("/api/openclaw/file", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: configPath, content }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error ?? "Failed to save config");
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setValidation(null);
    try {
      await saveConfig();
      toast.success("Config saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save config";
      setError(message);
      toast.error("Failed to save config", { description: message });
    } finally {
      setSaving(false);
    }
  };

  const applyAndRestart = async () => {
    setApplying(true);
    setError(null);
    setValidation(null);
    try {
      await saveConfig();
      const restartRes = await fetch("/api/sessions/kill-all", { method: "POST" });
      const restartData = (await restartRes.json().catch(() => null)) as { error?: string } | null;
      if (!restartRes.ok || restartData?.error) {
        throw new Error(
          restartData?.error ?? restartRes.statusText ?? "Failed to restart gateway"
        );
      }
      toast.success("Applied changes and restarted");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to apply config";
      setError(message);
      toast.error("Apply & restart failed", { description: message });
    } finally {
      setApplying(false);
    }
  };

  return (
    <section className="section-card">
      <div className="section-header">
        <h2 className="section-title">Advanced Config</h2>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost btn-sm"
            onClick={load}
            disabled={loading || saving || applying}
          >
            {loading ? "Loading..." : "Open"}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={save}
            disabled={saving || applying}
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setApplyConfirmOpen(true)}
            disabled={saving || applying}
          >
            {applying ? "Applying..." : "Apply and restart"}
          </button>
        </div>
      </div>
      <div className="section-body space-y-3">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Edit the backend config file. Use this when you need to change models, tools, or runtime behavior.
        </p>
        {error && (
          <div className="text-sm" style={{ color: "var(--accent-red)" }}>
            {error}
          </div>
        )}
        {validation && (
          <div className="text-sm" style={{ color: "var(--state-success)" }}>
            {validation}
          </div>
        )}
        <div>
          <label
            className="text-xs"
            htmlFor="openclaw-config-path"
            style={{ color: "var(--text-dim)" }}
          >
            Config file path
          </label>
          <div className="flex gap-2 mt-2">
            <input
              id="openclaw-config-path"
              name="openclawConfigPath"
              autoComplete="off"
              className="input flex-1"
              value={configPath}
              onChange={(e) => setConfigPath(e.target.value)}
              placeholder={DEFAULT_OPENCLAW_CONFIG_PATH}
            />
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setConfigPath(DEFAULT_OPENCLAW_CONFIG_PATH)}
              type="button"
            >
              Use default
            </button>
          </div>
          <p className="text-xs mt-2" style={{ color: "var(--text-dim)" }}>
            Tip: If you see validation errors in Live, open the default config file here and fix them.
          </p>
        </div>
        <textarea
          id="openclaw-config-content"
          name="openclawConfigContent"
          autoComplete="off"
          className="textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Configuration (JSON/YAML)…"
          style={{ minHeight: 280 }}
        />
      </div>

      <ConfirmDialog
        open={applyConfirmOpen}
        onOpenChange={(open) => {
          if (applying) return;
          setApplyConfirmOpen(open);
        }}
        title="Apply changes and restart?"
        description={
          <>
            This will save your config and stop all running sessions. This cannot be undone.
          </>
        }
        confirmLabel="Apply and restart"
        confirmVariant="danger"
        confirmLoading={applying}
        onConfirm={() => {
          setApplyConfirmOpen(false);
          void applyAndRestart();
        }}
      />
    </section>
  );
}
