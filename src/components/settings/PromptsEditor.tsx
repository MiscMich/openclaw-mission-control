"use client";

import { memo, useState, useCallback, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { MappedIcon } from "@/components/ui";
import { toast } from "sonner";

interface PromptsEditorProps {
  configPath: string;
  agentId: string;
  onContentChange?: (filename: string, content: string) => void;
}

const FILE_CONFIGS: Record<string, { label: string; description: string }> = {
  "SOUL.md": { label: "SOUL.md", description: "Agent personality and behavior instructions" },
  "AGENTS.md": { label: "AGENTS.md", description: "Team roster and collaboration context" },
  "HEARTBEAT.md": { label: "HEARTBEAT.md", description: "Periodic check-in instructions" },
  "IDENTITY.md": { label: "IDENTITY.md", description: "Agent identity and persona definition" },
  "USER.md": { label: "USER.md", description: "User context and preferences" },
  "TOOLS.md": { label: "TOOLS.md", description: "Available tools and usage guidelines" },
  "WORKING.md": { label: "WORKING.md", description: "Working memory and current context" },
  "MEMORY.md": { label: "MEMORY.md", description: "Long-term memory and learned notes" },
};

const FILE_NAMES = Object.keys(FILE_CONFIGS);

export const PromptsEditor = memo(function PromptsEditor({
  configPath,
  agentId,
  onContentChange,
}: PromptsEditorProps) {
  const [activeFile, setActiveFile] = useState("SOUL.md");
  const [contents, setContents] = useState<Record<string, string>>({});
  const [loadedFiles, setLoadedFiles] = useState<Set<string>>(new Set());
  const [loadingFile, setLoadingFile] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);

  const fetchFile = useCallback(async (filename: string) => {
    setLoadingFile(filename);
    try {
      const res = await fetch(
        `/api/openclaw/file?path=${encodeURIComponent(`${configPath}/${filename}`)}`
      );
      const data = await res.json();
      if (data.ok && typeof data.content === "string") {
        setContents((prev) => ({ ...prev, [filename]: data.content }));
      } else {
        setContents((prev) => ({ ...prev, [filename]: "" }));
      }
    } catch {
      setContents((prev) => ({ ...prev, [filename]: "" }));
      toast.error(`Failed to load ${filename}`);
    } finally {
      setLoadedFiles((prev) => new Set(prev).add(filename));
      setLoadingFile(null);
    }
  }, [configPath]);

  // Load SOUL.md on mount (or when configPath/agentId changes)
  useEffect(() => {
    setContents({});
    setLoadedFiles(new Set());
    setHasChanges(false);
    setActiveFile("SOUL.md");
    fetchFile("SOUL.md");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configPath, agentId]);

  const handleTabClick = useCallback((filename: string) => {
    setActiveFile(filename);
    if (!loadedFiles.has(filename)) {
      fetchFile(filename);
    }
  }, [loadedFiles, fetchFile]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value === undefined) return;
    setHasChanges(true);
    setContents((prev) => ({ ...prev, [activeFile]: value }));
    onContentChange?.(activeFile, value);
  }, [activeFile, onContentChange]);

  const handleEditorMount = useCallback((editorInstance: editor.IStandaloneCodeEditor) => {
    const themeService = (editorInstance as unknown as {
      _themeService?: { setTheme?: (themeName: string) => void };
    })._themeService;
    themeService?.setTheme?.("vs-dark");
  }, []);

  const isLoading = loadingFile === activeFile;
  const currentContent = contents[activeFile] ?? "";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3
          className="text-sm font-semibold uppercase tracking-wide"
          style={{ color: "var(--text-secondary)" }}
        >
          System Prompts
        </h3>
        {hasChanges && (
          <div
            className="text-xs px-2 py-1 rounded"
            style={{
              background: "var(--accent-soft)",
              color: "var(--accent-primary)"
            }}
          >
            Unsaved changes
          </div>
        )}
      </div>

      {/* File Tabs - scrollable horizontal */}
      <div
        ref={tabsRef}
        className="flex gap-1.5 p-1 rounded-lg overflow-x-auto"
        style={{
          background: "var(--bg-base)",
          border: "1px solid var(--border-subtle)",
          scrollbarWidth: "thin",
        }}
      >
        {FILE_NAMES.map((filename) => {
          const config = FILE_CONFIGS[filename];
          const isActive = activeFile === filename;

          return (
            <button
              key={filename}
              onClick={() => handleTabClick(filename)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md transition-all whitespace-nowrap shrink-0"
              style={{
                background: isActive ? "var(--bg-elevated)" : "transparent",
                color: isActive ? "var(--text-primary)" : "var(--text-dim)",
                border: isActive ? "1px solid var(--border-hover)" : "1px solid transparent",
              }}
            >
              <span style={{ color: isActive ? "var(--accent-primary)" : "inherit" }}>
                <MappedIcon name="files" size="xs" />
              </span>
              <span className="font-medium text-sm">{config.label}</span>
            </button>
          );
        })}
      </div>

      {/* File Description */}
      <div
        className="px-4 py-3 rounded-lg flex items-center gap-3"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)"
        }}
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{
            background: "var(--accent-soft)",
            color: "var(--accent-primary)"
          }}
        >
          <MappedIcon name="files" size="sm" />
        </div>
        <div className="flex-1">
          <div
            className="font-semibold text-sm mb-0.5"
            style={{ color: "var(--text-primary)" }}
          >
            {FILE_CONFIGS[activeFile].label}
          </div>
          <div
            className="text-xs"
            style={{ color: "var(--text-dim)" }}
          >
            {FILE_CONFIGS[activeFile].description}
          </div>
        </div>
        {isLoading && (
          <div
            className="text-xs px-2 py-1 rounded"
            style={{ color: "var(--text-muted)" }}
          >
            Loading...
          </div>
        )}
      </div>

      {/* Monaco Editor */}
      <div
        className="rounded-lg overflow-hidden border"
        style={{
          borderColor: "var(--border-subtle)",
          minHeight: "500px"
        }}
      >
        <Editor
          height="500px"
          language="markdown"
          value={currentContent}
          onChange={handleEditorChange}
          onMount={handleEditorMount}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "Geist Mono, Monaco, Courier New, monospace",
            lineHeight: 24,
            padding: { top: 16, bottom: 16 },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            wrappingStrategy: "advanced",
            automaticLayout: true,
            tabSize: 2,
            insertSpaces: true,
            rulers: [80],
            renderLineHighlight: "all",
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            smoothScrolling: true,
            scrollbar: {
              vertical: "visible",
              horizontal: "visible",
              useShadows: false,
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
            },
          }}
        />
      </div>

      <div
        className="text-xs flex items-center gap-2"
        style={{ color: "var(--text-dim)" }}
      >
        <MappedIcon name="warning" size="xs" />
        Changes are auto-saved when you save the agent settings
      </div>
    </div>
  );
});
