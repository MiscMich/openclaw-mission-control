"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convexApi";
import { Tabs, TabsList, TabsTrigger, TabsContent, Button, Input, FormGroup, AgentAvatar, MappedIcon } from "@/components/ui";
import { ProfileEditor } from "./ProfileEditor";
import { ModelSelector } from "./ModelSelector";
import { SkillsManager } from "./SkillsManager";
import { PromptsEditor } from "./PromptsEditor";
import { toast } from "sonner";

const DEFAULT_HEARTBEAT_CRON = "*/15 * * * *";

export function AgentSettingsPanelV2({ agentId }: { agentId: string }) {
  const agent = useQuery(api.agents.getById, { id: agentId });
  const agentSettings = useQuery(api.agentSettings.get, { agentId });
  const skillsRootSetting = useQuery(api.settings.get, { key: "skillsRoot" });
  const saveSettings = useMutation(api.agentSettings.save);
  const updateAgent = useMutation(api.agents.updateProfile);

  // Profile state
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [role, setRole] = useState("");

  // Model state
  const [modelPrimary, setModelPrimary] = useState("");
  const [modelFallbacks, setModelFallbacks] = useState<string[]>([]);

  // Skills state
  const [skills, setSkills] = useState<string[]>([]);

  // Prompts state
  const [soul, setSoul] = useState("");
  const [agentsMd, setAgentsMd] = useState("");
  const [heartbeat, setHeartbeat] = useState("");

  // Advanced state
  const [sessionKey, setSessionKey] = useState("");
  const [toolPolicy, setToolPolicy] = useState("");
  const [heartbeatCron, setHeartbeatCron] = useState(DEFAULT_HEARTBEAT_CRON);
  const [configPath, setConfigPath] = useState("");

  // UI state
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const [cronStatus, setCronStatus] = useState<string | null>(null);

  const fallbackPath = useMemo(() => agentId, [agentId]);

  // Load agent data
  useEffect(() => {
    if (!agent) return;
    setName(agent.name);
    setEmoji(agent.emoji);
    setRole(agent.role);
    setModelPrimary(agent.model);
  }, [agent]);

  // Load settings data
  useEffect(() => {
    if (!agentSettings) return;
    setName(agentSettings.name);
    setEmoji(agentSettings.emoji);
    setRole(agentSettings.role);
    setSessionKey(agentSettings.sessionKey ?? "");
    setModelPrimary(agentSettings.model.primary);
    setModelFallbacks(agentSettings.model.fallbacks);
    setSkills(agentSettings.skills);
    setSoul(agentSettings.systemPrompts.soul);
    setAgentsMd(agentSettings.systemPrompts.agents);
    setHeartbeat(agentSettings.systemPrompts.heartbeat);
    setToolPolicy(agentSettings.toolPolicy ?? "");
    setHeartbeatCron(agentSettings.heartbeatCron ?? DEFAULT_HEARTBEAT_CRON);
    setConfigPath(agentSettings.configPath ?? fallbackPath);
  }, [agentSettings, fallbackPath]);

  // Auto-load from files on mount if no saved settings exist
  const [autoLoaded, setAutoLoaded] = useState(false);

  useEffect(() => {
    if (autoLoaded) return;
    if (!agent) return;
    if (agentSettings !== null && agentSettings !== undefined) return;

    const base = configPath || fallbackPath;
    if (!base) return;

    const doAutoLoad = async () => {
      const fetchFile = async (path: string) => {
        try {
          const res = await fetch(`/api/openclaw/file?path=${encodeURIComponent(path)}`);
          const data = await res.json();
          if (data.ok && typeof data.content === "string") return data.content as string;
        } catch {
          // ignore
        }
        return "";
      };

      const [soulContent, agentsContent, heartbeatContent, configContent] = await Promise.all([
        fetchFile(`${base}/SOUL.md`),
        fetchFile(`${base}/AGENTS.md`),
        fetchFile(`${base}/HEARTBEAT.md`),
        fetchFile(`${base}/agent.config.json`),
      ]);

      if (soulContent) setSoul(soulContent);
      if (agentsContent) setAgentsMd(agentsContent);
      if (heartbeatContent) setHeartbeat(heartbeatContent);

      if (configContent) {
        try {
          const parsed = JSON.parse(configContent);
          if (parsed.modelPrimary) setModelPrimary(parsed.modelPrimary);
          if (parsed.modelFallbacks) setModelFallbacks(parsed.modelFallbacks);
          if (parsed.skills) setSkills(parsed.skills);
          if (parsed.toolPolicy) setToolPolicy(parsed.toolPolicy);
          if (parsed.heartbeatCron) setHeartbeatCron(parsed.heartbeatCron);
          if (parsed.sessionKey) setSessionKey(parsed.sessionKey);
        } catch {
          // ignore
        }
      }

      setAutoLoaded(true);
    };

    doAutoLoad();
  }, [agent, agentSettings, configPath, fallbackPath, autoLoaded]);

  const save = useCallback(async () => {
    if (!agent) return;
    setSaving(true);
    setCronStatus(null);

    try {
      const base = configPath || fallbackPath;

      await saveSettings({
        agentId,
        name,
        emoji,
        role,
        sessionKey: sessionKey || undefined,
        model: { primary: modelPrimary, fallbacks: modelFallbacks },
        skills,
        systemPrompts: { soul, agents: agentsMd, heartbeat },
        toolPolicy,
        heartbeatCron,
        configPath: base,
      });

      await updateAgent({
        id: agentId,
        name,
        emoji,
        role,
        model: modelPrimary,
      });

      const writeFile = async (path: string, content: string) => {
        await fetch("/api/openclaw/file", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, content }),
        });
      };

      await Promise.all([
        writeFile(`${base}/SOUL.md`, soul),
        writeFile(`${base}/AGENTS.md`, agentsMd),
        writeFile(`${base}/HEARTBEAT.md`, heartbeat),
        writeFile(
          `${base}/agent.config.json`,
          JSON.stringify(
            {
              modelPrimary,
              modelFallbacks,
              skills,
              toolPolicy: toolPolicy || undefined,
              heartbeatCron: heartbeatCron || undefined,
              sessionKey: sessionKey || undefined,
            },
            null,
            2
          )
        ),
      ]);

      toast.success("Settings saved", {
        description: "Agent configuration updated successfully"
      });
    } catch (error) {
      toast.error("Failed to save settings", {
        description: error instanceof Error ? error.message : "Unknown error"
      });
    } finally {
      setSaving(false);
    }
  }, [
    agent,
    agentId,
    name,
    emoji,
    role,
    sessionKey,
    modelPrimary,
    modelFallbacks,
    skills,
    soul,
    agentsMd,
    heartbeat,
    toolPolicy,
    heartbeatCron,
    configPath,
    fallbackPath,
    saveSettings,
    updateAgent,
  ]);

  const applyHeartbeat = useCallback(async () => {
    if (!agent) return;
    setCronStatus(null);

    if (!heartbeatCron.trim()) {
      toast.error("Check-in schedule is required");
      return;
    }

    try {
      const res = await fetch("/api/openclaw/cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          cron: heartbeatCron.trim(),
          name,
          role,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error ?? "Failed to apply heartbeat");
      }
      setCronStatus("Heartbeat schedule applied.");
      toast.success("Heartbeat schedule applied");
    } catch (error) {
      toast.error("Failed to apply heartbeat", {
        description: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }, [agent, agentId, heartbeatCron, name, role]);

  const removeHeartbeat = useCallback(async () => {
    if (!agent) return;
    setCronStatus(null);

    try {
      const res = await fetch("/api/openclaw/cron/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error ?? "Failed to remove heartbeat");
      }
      setCronStatus("Heartbeat schedule removed.");
      toast.success("Heartbeat schedule removed");
    } catch (error) {
      toast.error("Failed to remove heartbeat", {
        description: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }, [agent, agentId]);

  if (!agent) {
    return (
      <div
        className="rounded-xl p-8 border"
        style={{
          background: "var(--bg-elevated)",
          borderColor: "var(--border-subtle)"
        }}
      >
        <div className="h-20 rounded-lg animate-pulse" style={{ background: "var(--bg-surface)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className="rounded-xl p-6 border"
        style={{
          background: "var(--bg-elevated)",
          borderColor: "var(--border-subtle)"
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <AgentAvatar
              agentId={agentId}
              name={name}
              size="lg"
            />
            <div>
              <h2
                className="text-xl font-bold mb-1"
                style={{ color: "var(--text-primary)" }}
              >
                {name || "Agent Settings"}
              </h2>
              <p
                className="text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                {role || "Configure agent behavior and capabilities"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="md"
              onClick={save}
              loading={saving}
            >
              <MappedIcon name="download" size="md" />
              Save Settings
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="profile">
            <MappedIcon name="user" size="md" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="models">
            <MappedIcon name="chart" size="md" />
            Models
          </TabsTrigger>
          <TabsTrigger value="skills">
            <MappedIcon name="lightning" size="md" />
            Skills
          </TabsTrigger>
          <TabsTrigger value="prompts">
            <MappedIcon name="files" size="md" />
            Prompts
          </TabsTrigger>
          <TabsTrigger value="advanced">
            <MappedIcon name="settings" size="md" />
            Advanced
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <div
            className="rounded-xl p-6 border"
            style={{
              background: "var(--bg-elevated)",
              borderColor: "var(--border-subtle)"
            }}
          >
            <ProfileEditor
              name={name}
              role={role}
              onNameChange={setName}
              onRoleChange={setRole}
            />
          </div>
        </TabsContent>

        <TabsContent value="models">
          <div
            className="rounded-xl p-6 border"
            style={{
              background: "var(--bg-elevated)",
              borderColor: "var(--border-subtle)"
            }}
          >
            <ModelSelector
              primary={modelPrimary}
              fallbacks={modelFallbacks}
              onPrimaryChange={setModelPrimary}
              onFallbacksChange={setModelFallbacks}
            />
          </div>
        </TabsContent>

        <TabsContent value="skills">
          <div
            className="rounded-xl p-6 border"
            style={{
              background: "var(--bg-elevated)",
              borderColor: "var(--border-subtle)"
            }}
          >
            <SkillsManager
              skills={skills}
              configPath={configPath || fallbackPath}
              skillsRoot={
                typeof skillsRootSetting?.value === "string" && skillsRootSetting.value.trim()
                  ? skillsRootSetting.value
                  : "skills"
              }
              onSkillsChange={setSkills}
            />
          </div>
        </TabsContent>

        <TabsContent value="prompts">
          <div
            className="rounded-xl p-6 border"
            style={{
              background: "var(--bg-elevated)",
              borderColor: "var(--border-subtle)"
            }}
          >
            <PromptsEditor
              configPath={configPath || fallbackPath}
              agentId={agentId}
              onContentChange={(filename, content) => {
                if (filename === "SOUL.md") setSoul(content);
                else if (filename === "AGENTS.md") setAgentsMd(content);
                else if (filename === "HEARTBEAT.md") setHeartbeat(content);
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="advanced">
          <div
            className="rounded-xl p-6 border space-y-6"
            style={{
              background: "var(--bg-elevated)",
              borderColor: "var(--border-subtle)"
            }}
          >
            <div>
              <h3
                className="text-sm font-semibold mb-4 uppercase tracking-wide"
                style={{ color: "var(--text-secondary)" }}
              >
                Advanced Configuration
              </h3>

              <div className="grid gap-6 md:grid-cols-2">
                <FormGroup>
                  <Input
                    label="Session Key"
                    value={sessionKey}
                    onChange={(e) => setSessionKey(e.target.value)}
                    placeholder={`agent:${agentId}:main`}
                    hint="Unique identifier for agent sessions"
                  />
                </FormGroup>

                <FormGroup>
                  <Input
                    label="Config Path"
                    value={configPath}
                    onChange={(e) => setConfigPath(e.target.value)}
                    placeholder={fallbackPath}
                    hint="Where this agent keeps its files"
                  />
                </FormGroup>

                <FormGroup>
                  <Input
                    label="Check-in schedule"
                    value={heartbeatCron}
                    onChange={(e) => setHeartbeatCron(e.target.value)}
                    placeholder="0 */6 * * *"
                    hint="When this agent checks in (advanced)"
                  />
                </FormGroup>

                <FormGroup>
                  <Input
                    label="Tool Policy"
                    value={toolPolicy}
                    onChange={(e) => setToolPolicy(e.target.value)}
                    placeholder="default"
                    hint="Rules for what tools this agent can use"
                  />
                </FormGroup>
              </div>
            </div>

            <div
              className="p-4 rounded-lg border space-y-3"
              style={{
                background: "var(--bg-base)",
                borderColor: "var(--border-subtle)"
              }}
            >
              <h4
                className="text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Heartbeat Management
              </h4>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={applyHeartbeat}
                  disabled={!heartbeatCron.trim()}
                >
                  Apply Schedule
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={removeHeartbeat}
                >
                  Remove Schedule
                </Button>
              </div>
              {cronStatus && (
                <div
                  className="text-sm"
                  style={{ color: "var(--accent-primary)" }}
                >
                  {cronStatus}
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
