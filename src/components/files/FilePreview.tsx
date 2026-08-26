"use client";

import { memo, useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { Button, MappedIcon } from "@/components/ui";
import { FileEditor } from "./FileEditor";
import { toast } from "sonner";

type FilePreviewProps = {
  file: {
    name: string;
    path: string;
    type: "file" | "dir";
    size: number;
  };
  onClose?: () => void;
};

const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"];
const VIDEO_EXTS = ["mp4", "webm", "ogg", "mov"];
const PDF_EXTS = ["pdf"];
const HTML_EXTS = ["html", "htm"];
const CODE_EXTS = [
  "js", "jsx", "ts", "tsx", "json", "md", "css", "scss", "py",
  "rs", "go", "yaml", "yml", "toml", "sh", "bash", "zsh", "txt", "env"
];

function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function getFileType(filename: string): "pdf" | "html" | "image" | "video" | "code" | "other" {
  const ext = getFileExtension(filename);
  if (PDF_EXTS.includes(ext)) return "pdf";
  if (HTML_EXTS.includes(ext)) return "html";
  if (IMAGE_EXTS.includes(ext)) return "image";
  if (VIDEO_EXTS.includes(ext)) return "video";
  if (CODE_EXTS.includes(ext)) return "code";
  return "other";
}

export const FilePreview = memo(function FilePreview({ file, onClose }: FilePreviewProps) {
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [previewMode, setPreviewMode] = useState<"source" | "preview">("preview");

  const fileType = getFileType(file.name);
  const isEditable = fileType === "code" || fileType === "html";
  const hasUnsavedChanges = content !== originalContent;

  // Load file content
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setIsEditMode(false);

    const loadFile = async () => {
      try {
        if (fileType === "image" || fileType === "video") {
          const res = await fetch(`/api/openclaw/file?path=${encodeURIComponent(file.path)}`);
          const data = await res.json();

          if (!active) return;

          if (!data.ok) {
            throw new Error(data.error || "Failed to load media");
          }

          // For media, we'll create a data URL from the content
          const blob = new Blob([data.content], {
            type: fileType === "image" ? "image/*" : "video/*"
          });
          objectUrl = URL.createObjectURL(blob);
          setMediaUrl(objectUrl);
        } else {
          const res = await fetch(`/api/openclaw/file?path=${encodeURIComponent(file.path)}`);
          const data = await res.json();

          if (!active) return;

          if (!data.ok) {
            throw new Error(data.error || "Failed to load file");
          }

          setContent(data.content || "");
          setOriginalContent(data.content || "");
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load file");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadFile();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.path, fileType]);

  const handleSave = useCallback(async () => {
    if (!hasUnsavedChanges) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/openclaw/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: file.path, content }),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to save file");
      }

      setOriginalContent(content);
      toast.success("File saved", {
        description: file.name,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to save file";
      setError(errorMessage);
      toast.error("Save failed", {
        description: errorMessage,
      });
    } finally {
      setSaving(false);
    }
  }, [file.path, file.name, content, hasUnsavedChanges]);

  const handleDiscard = useCallback(() => {
    if (!hasUnsavedChanges) return;

    const confirmed = window.confirm("Discard unsaved changes?");
    if (!confirmed) return;

    setContent(originalContent);
    toast.info("Changes discarded");
  }, [hasUnsavedChanges, originalContent]);

  const toggleEditMode = useCallback(() => {
    if (isEditMode && hasUnsavedChanges) {
      const confirmed = window.confirm("You have unsaved changes. Continue anyway?");
      if (!confirmed) return;
    }
    setIsEditMode(!isEditMode);
  }, [isEditMode, hasUnsavedChanges]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[360px]">
        <div className="text-sm" style={{ color: "var(--text-muted)" }}>
          Loading file...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[360px] p-8">
        <div className="mb-4" style={{ color: "var(--accent-error)" }}>
          <MappedIcon name="error" size="xl" />
        </div>
        <div className="text-lg font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
          Failed to load file
        </div>
        <div className="text-sm" style={{ color: "var(--text-muted)" }}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-3">
          <div className="text-lg font-semibold">
            {isEditMode ? "Editor" : "Preview"}
          </div>
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--text-muted)",
            }}
          >
            {file.name}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {fileType === "html" && !isEditMode && (
            <div className="flex items-center gap-1 border border-[var(--border-subtle)] rounded-md overflow-hidden">
              <button
                className={`px-3 py-1 text-xs ${previewMode === "preview" ? "bg-[var(--bg-surface)] text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
                onClick={() => setPreviewMode("preview")}
              >Preview</button>
              <button
                className={`px-3 py-1 text-xs ${previewMode === "source" ? "bg-[var(--bg-surface)] text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
                onClick={() => setPreviewMode("source")}
              >Source</button>
            </div>
          )}

          {isEditable && (
            <Button
              variant={isEditMode ? "primary" : "ghost"}
              size="sm"
              onClick={toggleEditMode}
              mappedIcon="edit"
            >
              {isEditMode ? "Editing" : "Edit"}
            </Button>
          )}

          {isEditMode && hasUnsavedChanges && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDiscard}
                mappedIcon="delete"
              >
                Discard
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                loading={saving}
                mappedIcon="lightning"
              >
                {saving ? "Saving..." : "Save"}
              </Button>
            </>
          )}

          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              mappedIcon="close"
            />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {fileType === "image" && mediaUrl && (
          <div className="flex items-center justify-center h-full p-8">
            <Image
              src={mediaUrl}
              alt={file.name}
              width={1600}
              height={1000}
              unoptimized
              className="max-w-full max-h-full h-auto w-auto object-contain rounded-lg"
              style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}
            />
          </div>
        )}

        {fileType === "video" && mediaUrl && (
          <div className="flex items-center justify-center h-full p-8">
            <video
              src={mediaUrl}
              controls
              className="max-w-full max-h-full rounded-lg"
              style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}
            >
              Your browser does not support video playback.
            </video>
          </div>
        )}

        {fileType === "pdf" && (
          <iframe
            src={`/api/openclaw/file?path=${encodeURIComponent(file.path)}&raw=true`}
            className="w-full h-full border-0"
            title={file.name}
          />
        )}

        {fileType === "html" && previewMode === "preview" && !isEditMode && (
          <iframe
            srcDoc={content}
            sandbox="allow-same-origin"
            className="w-full h-full border-0"
            style={{ background: "white" }}
            title={file.name}
          />
        )}

        {fileType === "html" && isEditMode && (
          <FileEditor
            value={content}
            onChange={setContent}
            fileName={file.name}
            onSave={handleSave}
            hasUnsavedChanges={hasUnsavedChanges}
          />
        )}

        {fileType === "html" && previewMode === "source" && !isEditMode && (
          <pre
            className="h-full overflow-auto p-6 font-mono text-sm"
            style={{
              background: "var(--terminal-bg)",
              color: "var(--terminal-text)",
              lineHeight: 1.6,
            }}
          >
            <code>{content}</code>
          </pre>
        )}

        {fileType === "code" && isEditMode && (
          <FileEditor
            value={content}
            onChange={setContent}
            fileName={file.name}
            onSave={handleSave}
            hasUnsavedChanges={hasUnsavedChanges}
          />
        )}

        {fileType === "code" && !isEditMode && (
          <pre
            className="h-full overflow-auto p-6 font-mono text-sm"
            style={{
              background: "var(--terminal-bg)",
              color: "var(--terminal-text)",
              lineHeight: 1.6,
            }}
          >
            <code>{content}</code>
          </pre>
        )}

        {fileType === "other" && (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="mb-4" style={{ color: "var(--text-muted)" }}>
              <MappedIcon name="tasks" size="xl" />
            </div>
            <div className="text-lg font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Preview not available
            </div>
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>
              This file type cannot be previewed
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
