"use client";

import { memo, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import type { editor } from "monaco-editor";

// Monaco editor must be loaded dynamically to avoid SSR issues
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center h-full min-h-[360px]"
      style={{ background: "var(--terminal-bg)" }}
    >
      <div className="text-sm" style={{ color: "var(--text-muted)" }}>
        Loading editor...
      </div>
    </div>
  ),
});

type FileEditorProps = {
  value: string;
  onChange: (value: string) => void;
  fileName: string;
  readOnly?: boolean;
  onSave?: () => void;
  hasUnsavedChanges?: boolean;
};

// Map file extensions to Monaco language IDs
function getLanguageFromFileName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";

  const languageMap: Record<string, string> = {
    // JavaScript/TypeScript
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    mjs: "javascript",
    cjs: "javascript",

    // Web
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",

    // Data formats
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",

    // Markdown
    md: "markdown",
    mdx: "markdown",

    // Config files
    env: "shell",
    sh: "shell",
    bash: "shell",
    zsh: "shell",

    // Programming languages
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    c: "c",
    cpp: "cpp",
    cs: "csharp",
    php: "php",
    rb: "ruby",
    swift: "swift",
    kt: "kotlin",

    // Other
    sql: "sql",
    graphql: "graphql",
    dockerfile: "dockerfile",
    txt: "plaintext",
  };

  // Special cases for specific filenames
  if (fileName === "Dockerfile") return "dockerfile";
  if (fileName.startsWith(".env")) return "shell";

  return languageMap[ext] || "plaintext";
}

export const FileEditor = memo(function FileEditor({
  value,
  onChange,
  fileName,
  readOnly = false,
  onSave,
  hasUnsavedChanges = false,
}: FileEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleEditorDidMount = useCallback((editor: editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;

    // Add keyboard shortcut for save (Cmd+S / Ctrl+S)
    if (onSave) {
      editor.addCommand(
        // Monaco.KeyMod.CtrlCmd | Monaco.KeyCode.KeyS
        2048 | 49, // CtrlCmd + S
        () => {
          onSave();
        }
      );
    }

    // Focus the editor
    editor.focus();
  }, [onSave]);

  const handleChange = useCallback((value: string | undefined) => {
    onChange(value ?? "");
  }, [onChange]);

  const language = getLanguageFromFileName(fileName);

  return (
    <div className="relative" style={{ height: "calc(100vh - 320px)", minHeight: 400 }}>
      {/* Unsaved changes indicator */}
      {hasUnsavedChanges && (
        <div
          className="absolute top-2 right-2 z-10 flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--accent-warning)",
            color: "var(--accent-warning)",
          }}
        >
          <div className="w-2 h-2 rounded-full bg-current animate-pulse" />
          Unsaved changes
        </div>
      )}

      {/* Language indicator */}
      <div
        className="absolute top-2 left-2 z-10 text-xs px-2 py-1 rounded"
        style={{
          background: "var(--bg-elevated)",
          color: "var(--text-muted)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {language.toUpperCase()}
      </div>

      <MonacoEditor
        height="100%"
        language={language}
        value={value}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        theme="vs-dark"
        options={{
          readOnly,
          fontSize: 13,
          fontFamily: "var(--font-mono), 'Courier New', monospace",
          lineHeight: 20,
          minimap: {
            enabled: true,
            scale: 1,
          },
          scrollBeyondLastLine: false,
          renderWhitespace: "selection",
          tabSize: 2,
          insertSpaces: true,
          automaticLayout: true,
          wordWrap: "on",
          lineNumbers: "on",
          glyphMargin: false,
          folding: true,
          lineDecorationsWidth: 10,
          lineNumbersMinChars: 4,
          renderLineHighlight: "all",
          scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
            useShadows: false,
          },
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          contextmenu: true,
          quickSuggestions: true,
          formatOnPaste: true,
          formatOnType: true,
          links: true,
          mouseWheelZoom: true,
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          padding: {
            top: 16,
            bottom: 16,
          },
        }}
      />

      {/* Keyboard shortcut hint */}
      {onSave && (
        <div
          className="absolute bottom-2 right-2 text-xs px-2 py-1 rounded opacity-60"
          style={{
            background: "var(--bg-elevated)",
            color: "var(--text-dim)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {typeof navigator !== "undefined" && navigator.platform.indexOf("Mac") !== -1 ? "⌘" : "Ctrl"}+S to save
        </div>
      )}
    </div>
  );
});
