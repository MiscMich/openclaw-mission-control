"use client";

import { memo, useState, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui";
import { toast } from "sonner";

interface SkillsManagerProps {
  skills: string[];
  configPath: string;
  skillsRoot?: string;
  onSkillsChange: (skills: string[]) => void;
}

interface SkillItem {
  name: string;
  enabled: boolean;
  path: string;
  description?: string;
}

async function fetchSkillDescription(skillPath: string): Promise<string | undefined> {
  try {
    const res = await fetch(
      `/api/openclaw/file?path=${encodeURIComponent(skillPath + "/SKILL.md")}`
    );
    const data = await res.json();
    if (!data.ok || typeof data.content !== "string") return undefined;

    const content = data.content;

    // Try to extract description from frontmatter
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const descMatch = fmMatch[1].match(/description:\s*["']?(.*?)["']?\s*$/m);
      if (descMatch) return descMatch[1].trim().substring(0, 120);
    }

    // Fallback: first non-heading, non-empty line
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("---")) continue;
      return trimmed.substring(0, 120);
    }

    return undefined;
  } catch {
    return undefined;
  }
}

export const SkillsManager = memo(function SkillsManager({
  skills,
  configPath,
  skillsRoot = "skills",
  onSkillsChange,
}: SkillsManagerProps) {
  const [availableSkills, setAvailableSkills] = useState<SkillItem[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const loadAvailableSkills = useCallback(async () => {
    setDiscovering(true);
    try {
      // Try agent's workspace skills first
      const agentSkillsPath = `${configPath}/skills`;
      let skillsFound: string[] = [];
      let skillsBasePath = agentSkillsPath;

      try {
        const res = await fetch(
          `/api/openclaw/files?path=${encodeURIComponent(agentSkillsPath)}`
        );
        const data = await res.json();
        if (data.ok && data.items?.length > 0) {
          skillsFound = data.items
            .filter((item: { type: string }) => item.type === "dir")
            .map((item: { name: string }) => item.name);
        }
      } catch {
        // Fall back to global skills root
      }

      // If no agent-specific skills, try global
      if (skillsFound.length === 0) {
        skillsBasePath = skillsRoot;
        const res = await fetch(
          `/api/openclaw/files?path=${encodeURIComponent(skillsRoot)}`
        );
        const data = await res.json();
        if (!data.ok) throw new Error(data.error ?? "Failed to load skills");
        skillsFound = data.items
          .filter((item: { type: string }) => item.type === "dir")
          .map((item: { name: string }) => item.name);
      }

      // Sort alphabetically
      skillsFound.sort((a, b) => a.localeCompare(b));

      // Build initial list without descriptions (fast)
      const initialSkills = skillsFound.map((name) => ({
        name,
        enabled: skills.includes(name),
        path: `${skillsBasePath}/${name}`,
      }));
      setAvailableSkills(initialSkills);

      // Fetch descriptions in background (slower, don't block)
      const batchSize = 10;
      for (let i = 0; i < skillsFound.length; i += batchSize) {
        const batch = skillsFound.slice(i, i + batchSize);
        const descriptions = await Promise.all(
          batch.map((name) =>
            fetchSkillDescription(`${skillsBasePath}/${name}`)
          )
        );
        setAvailableSkills((prev) =>
          prev.map((skill) => {
            const idx = batch.indexOf(skill.name);
            if (idx === -1) return skill;
            return { ...skill, description: descriptions[idx] ?? skill.description };
          })
        );
      }
    } catch (error) {
      toast.error("Failed to discover skills", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setDiscovering(false);
    }
  }, [configPath, skillsRoot, skills]);

  useEffect(() => {
    loadAvailableSkills();
  }, [loadAvailableSkills]);

  const toggleSkill = useCallback(
    (skillName: string) => {
      const newSkills = skills.includes(skillName)
        ? skills.filter((s) => s !== skillName)
        : [...skills, skillName];
      onSkillsChange(newSkills);
    },
    [skills, onSkillsChange]
  );

  const enableAll = useCallback(() => {
    onSkillsChange(availableSkills.map((s) => s.name));
  }, [availableSkills, onSkillsChange]);

  const disableAll = useCallback(() => {
    onSkillsChange([]);
  }, [onSkillsChange]);

  // Derive enabled state from skills prop (source of truth) rather than stale internal state
  const skillsWithEnabled = useMemo(() => {
    return availableSkills.map((s) => ({
      ...s,
      enabled: skills.includes(s.name),
    }));
  }, [availableSkills, skills]);

  // Filter skills by search
  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) return skillsWithEnabled;
    const q = searchQuery.toLowerCase();
    return skillsWithEnabled.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q))
    );
  }, [skillsWithEnabled, searchQuery]);

  const enabledCount = skills.length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3
          className="text-sm font-semibold uppercase tracking-wide"
          style={{ color: "var(--text-secondary)" }}
        >
          Installed Skills
        </h3>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={enableAll}>
            Enable All
          </Button>
          <Button variant="ghost" size="sm" onClick={disableAll}>
            Disable All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadAvailableSkills}
            loading={discovering}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
            Refresh
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search skills..."
          className="w-full px-4 py-2.5 rounded-lg text-sm outline-none transition-colors"
          style={{
            background: "var(--bg-base)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-primary)",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--accent-primary)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--border-subtle)";
          }}
        />
        {searchQuery && (
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
            style={{ color: "var(--text-dim)" }}
          >
            {filteredSkills.length} result{filteredSkills.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Skill List */}
      {discovering && availableSkills.length === 0 ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-lg animate-pulse"
              style={{ background: "var(--bg-elevated)" }}
            />
          ))}
        </div>
      ) : filteredSkills.length === 0 ? (
        <div
          className="p-8 rounded-lg border border-dashed text-center"
          style={{
            borderColor: "var(--border-subtle)",
            background: "var(--bg-elevated)",
          }}
        >
          <p
            className="font-medium mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            {searchQuery ? "No matching skills" : "No skills found"}
          </p>
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            {searchQuery
              ? "Try a different search term"
              : `Install skills in ${skillsRoot}`}
          </p>
        </div>
      ) : (
        <div
          className="rounded-lg border overflow-hidden max-h-[500px] overflow-y-auto"
          style={{
            background: "var(--bg-base)",
            borderColor: "var(--border-subtle)",
          }}
        >
          {filteredSkills.map((skill, index) => (
            <button
              key={skill.name}
              type="button"
              onClick={() => toggleSkill(skill.name)}
              className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors cursor-pointer"
              style={{
                borderTop:
                  index > 0
                    ? "1px solid var(--border-subtle)"
                    : undefined,
                background: skill.enabled
                  ? "var(--bg-elevated)"
                  : "transparent",
              }}
              onMouseEnter={(e) => {
                if (!skill.enabled) {
                  e.currentTarget.style.background = "var(--bg-hover)";
                }
              }}
              onMouseLeave={(e) => {
                if (!skill.enabled) {
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              <input
                type="checkbox"
                checked={skill.enabled}
                onChange={() => {}}
                className="w-4 h-4 rounded mt-0.5 flex-shrink-0 cursor-pointer"
                style={{ accentColor: "var(--accent-primary)" }}
                tabIndex={-1}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="font-medium text-sm"
                    style={{
                      color: skill.enabled
                        ? "var(--text-primary)"
                        : "var(--text-secondary)",
                    }}
                  >
                    {skill.name}
                  </span>
                  {skill.enabled && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide"
                      style={{
                        background: "var(--accent-soft)",
                        color: "var(--accent-primary)",
                      }}
                    >
                      Active
                    </span>
                  )}
                </div>
                {skill.description && (
                  <p
                    className="text-xs mt-0.5 line-clamp-1"
                    style={{ color: "var(--text-dim)" }}
                  >
                    {skill.description}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Summary */}
      <div
        className="px-4 py-3 rounded-lg border flex items-center justify-between"
        style={{
          background: "var(--bg-elevated)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "var(--accent-soft)" }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ color: "var(--accent-primary)" }}
            >
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
          </div>
          <div>
            <p
              className="text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {enabledCount} of {availableSkills.length} skill{availableSkills.length !== 1 ? "s" : ""} enabled
            </p>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>
              Skills extend agent capabilities with specialized tools and commands
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});
