"use client";

import { memo, useEffect, useMemo, useState, useCallback, useRef } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { GlassPanel, MappedIcon, type MappedIconName } from "@/components/ui";
import { FileEditor } from "./FileEditor";
import { FileOperations } from "./FileOperations";
import { toast } from "sonner";
import { api } from "@/lib/convexApi";

type FileEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  updatedAt: number;
};

type FileResponse = {
  ok: boolean;
  root?: string;
  path?: string;
  items?: FileEntry[];
  error?: string;
};

// File type detection
const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"];
const VIDEO_EXTS = ["mp4", "webm", "ogg", "mov"];
const CODE_EXTS = ["js", "jsx", "ts", "tsx", "json", "md", "css", "scss", "html", "py", "rs", "go", "yaml", "yml", "toml", "sh", "bash", "zsh"];
const TEXT_EXTS = ["txt", "log", "env", "ini", "conf", "cfg", "csv", "tsv", "xml"];
const CODE_FILENAMES = ["dockerfile", "makefile", "justfile"];
const TEXT_FILENAMES = [".env", ".gitignore", ".npmrc", ".editorconfig", ".prettierrc", ".eslintrc"];

function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function getFileType(filename: string): "image" | "video" | "code" | "text" | "other" {
  const lowerName = filename.toLowerCase();
  const ext = getFileExtension(filename);
  if (IMAGE_EXTS.includes(ext)) return "image";
  if (VIDEO_EXTS.includes(ext)) return "video";
  if (CODE_FILENAMES.includes(lowerName)) return "code";
  if (TEXT_FILENAMES.includes(lowerName)) return "text";
  if (CODE_EXTS.includes(ext)) return "code";
  if (TEXT_EXTS.includes(ext) || ext.length === 0) return "text";
  return "other";
}

function revokeMediaUrl(mediaUrl: string | null) {
  if (mediaUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(mediaUrl);
  }
}

function getFileIcon(entry: FileEntry): MappedIconName {
  if (entry.type === "dir") return "files";
  const ext = getFileExtension(entry.name);
  if (IMAGE_EXTS.includes(ext)) return "create"; // image icon
  if (VIDEO_EXTS.includes(ext)) return "activity"; // video icon
  if (["js", "jsx", "ts", "tsx"].includes(ext)) return "lightning";
  if (["json", "yaml", "yml", "toml"].includes(ext)) return "settings";
  if (["md", "txt"].includes(ext)) return "edit";
  if (["py"].includes(ext)) return "terminal";
  if (["css", "scss"].includes(ext)) return "create";
  if (["html"].includes(ext)) return "dashboard";
  if (["sh", "bash", "zsh"].includes(ext)) return "terminal";
  return "tasks"; // default file icon
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const FileManager = memo(function FileManager() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathParam = searchParams?.get("path") ?? ".";
  const openParam = searchParams?.get("open") ?? null;
  const [currentPath, setCurrentPath] = useState(pathParam);
  const lastOpenedRef = useRef<string | null>(null);
  const [items, setItems] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepthRef = useRef(0);

  const hasUnsavedChanges = content !== originalContent;
  const selectedFileType = selectedFile ? getFileType(selectedFile.name) : null;
  const isEditableSelectedFile =
    selectedFileType === "code" || selectedFileType === "text";
  const canCreateLinkedDoc = Boolean(selectedFile && isEditableSelectedFile);

  const createDoc = useMutation(api.documents.create);

  const directoryStack = useMemo(() => {
    const parts = currentPath.split("/").filter(Boolean);
    return [".", ...parts];
  }, [currentPath]);

  // Keep FileManager in sync with URL params (Command Palette deep links).
  useEffect(() => {
    if (!pathParam) return;
    if (pathParam === currentPath) return;

    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        "You have unsaved changes. Navigate anyway?"
      );
      if (!confirmed) return;
    }

    setCurrentPath(pathParam);
    setSelectedFile(null);
    setContent("");
    setOriginalContent("");
    setError(null);
    revokeMediaUrl(mediaUrl);
    setMediaUrl(null);
    lastOpenedRef.current = null;
  }, [currentPath, hasUnsavedChanges, mediaUrl, pathParam]);

  // Auto-open a file when `open=<path>` is present.
  useEffect(() => {
    if (!openParam) return;
    if (lastOpenedRef.current === openParam) return;

    const existing = items.find((item) => item.path === openParam);
    const entry: FileEntry = existing ?? {
      name: openParam.split("/").filter(Boolean).slice(-1)[0] ?? openParam,
      path: openParam,
      type: "file",
      size: 0,
      updatedAt: Date.now(),
    };

    lastOpenedRef.current = openParam;
    void openFile(entry);
  }, [items, openParam]);

  // Load directory contents
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetch(`/api/openclaw/files?path=${encodeURIComponent(currentPath)}`)
      .then((res) => res.json() as Promise<FileResponse>)
      .then((data) => {
        if (!active) return;
        if (!data.ok) throw new Error(data.error ?? "Failed to load files");
        setItems(data.items ?? []);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load files");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [currentPath, refreshKey]);

  // Cleanup media URL on unmount or file change
  useEffect(() => {
    return () => {
      revokeMediaUrl(mediaUrl);
    };
  }, [mediaUrl]);

  const openFile = useCallback(async (entry: FileEntry) => {
    if (entry.type === "dir") {
      setCurrentPath(entry.path);
      setSelectedFile(null);
      setContent("");
      setOriginalContent("");
      setError(null);
      revokeMediaUrl(mediaUrl);
      setMediaUrl(null);
      return;
    }

    // Check for unsaved changes
    if (hasUnsavedChanges) {
      const confirmed = window.confirm("You have unsaved changes. Continue anyway?");
      if (!confirmed) return;
    }

    setSelectedFile(entry);
    setContent("");
    setOriginalContent("");
    setError(null);
    revokeMediaUrl(mediaUrl);
    setMediaUrl(null);

    const fileType = getFileType(entry.name);

    if (fileType === "image" || fileType === "video") {
      setMediaUrl(
        `/api/openclaw/file?path=${encodeURIComponent(entry.path)}&raw=true&v=${entry.updatedAt}`
      );
      return;
    }

    if (fileType === "code" || fileType === "text") {
      // Fetch as text for code/text files
      const res = await fetch(`/api/openclaw/file?path=${encodeURIComponent(entry.path)}`);
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Failed to read file");
        return;
      }
      setContent(data.content ?? "");
      setOriginalContent(data.content ?? "");
      return;
    }

    setError("Preview is not available for this file type");
  }, [hasUnsavedChanges, mediaUrl]);

  const saveFile = async () => {
    if (!selectedFile || !hasUnsavedChanges) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/openclaw/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedFile.path, content }),
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error ?? "Failed to save file");
      }
      setOriginalContent(content);
      toast.success("File saved", { description: selectedFile.name });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to save file";
      setError(errorMessage);
      toast.error("Save failed", { description: errorMessage });
    } finally {
      setSaving(false);
    }
  };

  const downloadFile = async () => {
    if (!selectedFile) return;
    try {
      const res = await fetch(
        `/api/openclaw/file?path=${encodeURIComponent(selectedFile.path)}&raw=true`
      );
      if (!res.ok) {
        let message = "Failed to download";
        try {
          const payload = (await res.json()) as { error?: string };
          if (payload?.error) message = payload.error;
        } catch {
          // no-op
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = selectedFile.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("File downloaded", { description: selectedFile.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download file");
      toast.error("Download failed");
    }
  };

  const handleRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      const toastId = toast.loading(`Uploading ${files.length} file(s)...`);

      try {
        for (const file of files) {
          const target = currentPath === "." ? file.name : `${currentPath}/${file.name}`;
          const formData = new FormData();
          formData.append("path", target);
          formData.append("type", "file");
          formData.append("file", file);

          const res = await fetch("/api/openclaw/file", { method: "POST", body: formData });
          const data = await res.json();

          if (!data.ok) {
            throw new Error(data.error || `Failed to upload ${file.name}`);
          }
        }

        toast.success("Upload complete", {
          id: toastId,
          description: `Uploaded ${files.length} file(s)`,
        });

        handleRefresh();
      } catch (err) {
        toast.error("Upload failed", {
          id: toastId,
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
    [currentPath, handleRefresh]
  );

  const isFileDragEvent = (event: React.DragEvent) =>
    Array.from(event.dataTransfer.types ?? []).includes("Files");

  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDragEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();

    dragDepthRef.current += 1;
    setIsDragOver(true);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDragEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDragEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();

    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!isFileDragEvent(event)) return;
      event.preventDefault();
      event.stopPropagation();

      dragDepthRef.current = 0;
      setIsDragOver(false);

      const files = Array.from(event.dataTransfer.files ?? []);
      if (files.length === 0) return;
      void uploadFiles(files);
    },
    [uploadFiles]
  );

  const handleFileDeleted = useCallback(() => {
    setSelectedFile(null);
    setContent("");
    setOriginalContent("");
    revokeMediaUrl(mediaUrl);
    setMediaUrl(null);
  }, [mediaUrl]);

  const handleFileRenamed = useCallback(() => {
    setSelectedFile(null);
    setContent("");
    setOriginalContent("");
    revokeMediaUrl(mediaUrl);
    setMediaUrl(null);
  }, [mediaUrl]);

  const createLinkedDocFromSelectedFile = useCallback(async () => {
    if (!selectedFile) return;
    if (!isEditableSelectedFile) return;

    const toastId = toast.loading("Creating linked doc...");
    try {
      const result = await createDoc({
        title: selectedFile.name,
        content,
        type: "workspace_file",
        sourcePath: selectedFile.path,
        sourceKind: "workspace_file",
        createdBy: "operator",
      });

      toast.success("Linked doc created", {
        id: toastId,
        description: selectedFile.name,
      });

      router.push(`/?tab=documents&doc=${encodeURIComponent(result.id)}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create linked doc";
      toast.error("Create doc failed", { id: toastId, description: message });
    }
  }, [content, createDoc, isEditableSelectedFile, router, selectedFile]);

  // Render preview based on file type
  const renderPreview = () => {
    if (!selectedFile) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[360px] text-center p-8">
          <div className="mb-4" style={{ color: "var(--text-muted)" }}>
            <MappedIcon name="edit" size="xl" />
          </div>
          <div className="text-lg font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            No file selected
          </div>
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>
            Select a file from the workspace to preview or edit
          </div>
        </div>
      );
    }

    const fileType = getFileType(selectedFile.name);

    if (fileType === "image" && mediaUrl) {
      return (
        <div className="flex items-center justify-center h-full min-h-[360px] p-4">
          <Image
            src={mediaUrl}
            alt={selectedFile.name}
            width={1600}
            height={1000}
            unoptimized
            className="max-w-full max-h-[500px] h-auto w-auto rounded-lg object-contain"
            style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}
          />
        </div>
      );
    }

    if (fileType === "image" || fileType === "video") {
      if (!mediaUrl) {
        return (
          <div className="flex items-center justify-center h-full min-h-[360px] p-4">
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>
              Loading media preview...
            </div>
          </div>
        );
      }
    }

    if (fileType === "video" && mediaUrl) {
      return (
        <div className="flex items-center justify-center h-full min-h-[360px] p-4">
          <video
            src={mediaUrl}
            controls
            className="max-w-full max-h-[500px] rounded-lg"
            style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}
            aria-label={`Video preview of ${selectedFile.name}`}
          >
            Your browser does not support video playback.
          </video>
        </div>
      );
    }

    // Monaco editor for code and text files
    if (fileType === "code" || fileType === "text") {
      return (
        <FileEditor
          value={content}
          onChange={setContent}
          fileName={selectedFile.name}
          onSave={saveFile}
          hasUnsavedChanges={hasUnsavedChanges}
        />
      );
    }

    // Fallback for other file types
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[360px] text-center p-8">
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
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]" style={{ height: "calc(100vh - 220px)", minHeight: 500 }}>
      {/* File List */}
      <GlassPanel padding="none" className="flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)] flex-shrink-0">
          <div className="text-lg font-semibold">Files</div>
          <FileOperations
            currentPath={currentPath}
            selectedFile={selectedFile}
            onRefresh={handleRefresh}
            onFileCreated={handleRefresh}
            onFileDeleted={handleFileDeleted}
            onFileRenamed={handleFileRenamed}
          />
        </div>

        <div
          className="relative p-4 flex-1 overflow-y-auto min-h-0"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragOver ? (
            <div
              className="absolute inset-3 rounded-xl flex items-center justify-center pointer-events-none"
              style={{
                border: "2px dashed var(--accent-primary)",
                background: "rgba(0, 0, 0, 0.35)",
                zIndex: 10,
              }}
              aria-hidden="true"
            >
              <div
                className="text-sm font-medium px-4 py-2 rounded-lg"
                style={{
                  color: "var(--text-primary)",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                Drop files to upload
              </div>
            </div>
          ) : null}
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-xs mb-4 flex-wrap" style={{ color: "var(--text-muted)" }}>
            {directoryStack.map((segment, index) => {
              const path = index === 0 ? "." : directoryStack.slice(1, index + 1).join("/");
              return (
                <span key={`${segment}-${index}`} className="flex items-center gap-1">
                  {index > 0 && <span style={{ color: "var(--text-dim)" }}>/</span>}
                  <button
                    className="hover:text-[var(--accent-primary)] transition-colors px-1 py-0.5 rounded"
                    onClick={() => setCurrentPath(path)}
                  >
                    {segment === "." ? "~" : segment}
                  </button>
                </span>
              );
            })}
          </div>

          {/* File list */}
          {loading ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2"
                  style={{ opacity: 1 - i * 0.12 }}
                >
                  <div className="skeleton w-8 h-8 rounded-lg flex-shrink-0" />
                  <div className="skeleton h-4 rounded" style={{ width: `${70 - i * 8}%` }} />
                </div>
              ))}
            </div>
          ) : error && items.length === 0 ? (
            <div
              className="text-sm px-4 py-3 rounded-lg"
              style={{
                color: "var(--accent-error)",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
              }}
            >
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3" style={{ color: "var(--text-muted)" }}>
                <MappedIcon name="files" size="lg" />
              </div>
              <div className="text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                Empty folder
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                Drag files here or create new ones
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {items.map((entry) => (
                <button
                  key={entry.path}
                  onClick={() => openFile(entry)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors"
                  style={{
                    background:
                      selectedFile?.path === entry.path
                        ? "var(--accent-soft)"
                        : "transparent",
                    borderLeft:
                      selectedFile?.path === entry.path
                        ? "2px solid var(--accent-primary)"
                        : "2px solid transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (selectedFile?.path !== entry.path) {
                      e.currentTarget.style.background = "var(--bg-hover)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedFile?.path !== entry.path) {
                      e.currentTarget.style.background = "transparent";
                    }
                  }}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ background: "var(--bg-elevated)" }}
                    >
                      <MappedIcon name={getFileIcon(entry)} size="sm" />
                    </span>
                    <span className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
                      {entry.name}
                    </span>
                  </span>
                  <span className="text-xs font-mono" style={{ color: "var(--text-dim)" }}>
                    {entry.type === "dir" ? "folder" : formatFileSize(entry.size)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </GlassPanel>

      {/* Preview Panel */}
      <GlassPanel padding="none" className="flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="text-lg font-semibold">Editor</div>
            {selectedFile && (
              <>
                <span
                  className="text-xs px-2 py-0.5 rounded"
                  style={{
                    background: "var(--bg-elevated)",
                    color: "var(--text-muted)",
                  }}
                >
                  {selectedFile.name}
                </span>
                {hasUnsavedChanges && (
                  <span
                    className="text-xs px-2 py-0.5 rounded flex items-center gap-1"
                    style={{
                      background: "var(--bg-elevated)",
                      color: "var(--accent-warning)",
                      border: "1px solid var(--accent-warning)",
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    Modified
                  </span>
                )}
              </>
            )}
          </div>
          {selectedFile && isEditableSelectedFile && (
            <div className="flex items-center gap-2">
              <button
                className="btn btn-ghost btn-sm"
                onClick={createLinkedDocFromSelectedFile}
                disabled={!canCreateLinkedDoc}
                title={
                  canCreateLinkedDoc
                    ? "Create a document linked to this workspace file"
                    : "Select a code/text file to create a linked document"
                }
              >
                Create linked doc
              </button>
              <button className="btn btn-ghost btn-sm" onClick={downloadFile}>
                Download
              </button>
              {hasUnsavedChanges && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    if (window.confirm("Discard unsaved changes?")) {
                      setContent(originalContent);
                      toast.info("Changes discarded");
                    }
                  }}
                >
                  Discard
                </button>
              )}
              <button
                className="btn btn-primary btn-sm"
                onClick={saveFile}
                disabled={saving || !hasUnsavedChanges}
              >
                {saving ? "Saving..." : hasUnsavedChanges ? "Save" : "Saved"}
              </button>
            </div>
          )}
          {selectedFile && !isEditableSelectedFile && (
            <div className="flex items-center gap-2">
              <button
                className="btn btn-ghost btn-sm"
                onClick={createLinkedDocFromSelectedFile}
                disabled
                title="Create linked doc is only available for code/text files"
              >
                Create linked doc
              </button>
              <button className="btn btn-ghost btn-sm" onClick={downloadFile}>
                Download
              </button>
            </div>
          )}
        </div>

        <div className="relative flex-1 min-h-0">{renderPreview()}</div>

        {error && selectedFile && (
          <div
            className="mx-4 mb-4 text-sm px-4 py-3 rounded-lg"
            style={{
              color: "var(--accent-error)",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
          >
            {error}
          </div>
        )}
      </GlassPanel>
    </div>
  );
});

export default FileManager;
