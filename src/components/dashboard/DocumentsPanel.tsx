"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convexApi";
import { toast } from "sonner";
import Link from "next/link";
import {
  MappedIcon,
  DocumentCardSkeleton,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";

export const DocumentsPanel = memo(function DocumentsPanel({ taskId }: { taskId?: string }) {
  const documents = useQuery(
    taskId ? api.documents.listByTask : api.documents.listRecent,
    taskId ? { taskId } : { limit: 8 }
  );
  const createDoc = useMutation(api.documents.create);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState("deliverable");
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [sourceKind, setSourceKind] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedDoc = useMemo(() => {
    const source = documents ?? [];
    return source.find((doc) => doc.id === selectedId) ?? null;
  }, [documents, selectedId]);

  const selectedSourcePath =
    selectedDoc && typeof (selectedDoc as { sourcePath?: unknown }).sourcePath === "string"
      ? ((selectedDoc as { sourcePath: string }).sourcePath || null)
      : null;

  const openWorkspaceHref = useMemo(() => {
    if (!selectedSourcePath) return null;
    const parts = selectedSourcePath.split("/").filter(Boolean);
    const dirPath = parts.length <= 1 ? "." : parts.slice(0, -1).join("/");
    return `/?tab=workspace&path=${encodeURIComponent(dirPath)}&open=${encodeURIComponent(selectedSourcePath)}`;
  }, [selectedSourcePath]);

  const [importOpen, setImportOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importFiles, setImportFiles] = useState<
    Array<{ name: string; path: string; type: "file" | "dir" }>
  >([]);
  const [importQuery, setImportQuery] = useState("");

  useEffect(() => {
    if (!importOpen) return;
    if (importFiles.length > 0) return;

    let active = true;
    setImportLoading(true);
    setImportError(null);

    fetch("/api/openclaw/files?recursive=true")
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (!data?.ok || !Array.isArray(data.files)) {
          throw new Error(data?.error ?? "Failed to load files");
        }
        setImportFiles(
          (data.files as Array<{ name: string; path: string; type: "file" | "dir" }>).filter(
            (item) => item.type === "file"
          )
        );
      })
      .catch((err) => {
        if (!active) return;
        setImportError(err instanceof Error ? err.message : "Failed to load files");
      })
      .finally(() => {
        if (!active) return;
        setImportLoading(false);
      });

    return () => {
      active = false;
    };
  }, [importFiles.length, importOpen]);

  const filteredImportFiles = useMemo(() => {
    const source = importFiles;
    const query = importQuery.trim().toLowerCase();

    if (!query) return source.slice(0, 50);
    if (query.length < 2) return source.slice(0, 50);

    return source
      .filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.path.toLowerCase().includes(query)
      )
      .slice(0, 50);
  }, [importFiles, importQuery]);

  const handleImportSelect = useCallback(
    async (file: { name: string; path: string }) => {
      try {
        const res = await fetch(
          `/api/openclaw/file?path=${encodeURIComponent(file.path)}`,
          { cache: "no-store" }
        );
        const data = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string; content?: string }
          | null;

        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || `Failed to read ${file.path}`);
        }

        const fileContent = typeof data.content === "string" ? data.content : "";

        setTitle(file.name);
        setContent(fileContent);
        setType("workspace_file");
        setSourcePath(file.path);
        setSourceKind("workspace_file");
        setImportOpen(false);
        setImportError(null);
        toast.success("File imported", { description: file.name });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to import file";
        toast.error("Import failed", { description: message });
      }
    },
    []
  );

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createDoc({
        title,
        content,
        type,
        createdBy: "planner",
        taskId,
        ...(sourcePath ? { sourcePath } : {}),
        ...(sourceKind ? { sourceKind } : {}),
      });
      toast.success("Document created", { description: `"${title}" added` });
      setTitle("");
      setContent("");
      setSourcePath(null);
      setSourceKind(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to create document", error);
      toast.error("Failed to create document", { description: errorMessage });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="section-card">
      <div className="section-header">
        <h2 className="section-title">Documents</h2>
        <span className="section-badge">{documents?.length ?? 0}</span>
      </div>
      <div className="section-body space-y-4">
        <div className="grid gap-2">
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New document title"
          />
          <textarea
            className="textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write document content"
          />
          <div className="flex items-center gap-2">
            <select
              className="input"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="deliverable">Deliverable</option>
              <option value="research">Research</option>
              <option value="protocol">Protocol</option>
              <option value="workspace_file">File</option>
            </select>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                setImportOpen(true);
                setImportError(null);
              }}
            >
              Import file
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={saving}>
              {saving ? "Saving..." : "Create"}
            </button>
          </div>
        </div>

        {selectedSourcePath && openWorkspaceHref && (
          <div
            className="px-3 py-2 rounded-lg flex items-center justify-between gap-3"
            style={{
              border: "1px solid var(--border-subtle)",
              background: "var(--bg-elevated)",
            }}
          >
            <div className="min-w-0">
              <div className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                Linked file
              </div>
              <div className="text-[10px] font-mono truncate" style={{ color: "var(--text-dim)" }}>
                {selectedSourcePath}
              </div>
            </div>
            <Link href={openWorkspaceHref} className="btn btn-ghost btn-sm flex-shrink-0">
              Open in Files
            </Link>
          </div>
        )}

        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Import file</DialogTitle>
              <div className="text-xs" style={{ color: "var(--text-dim)" }}>
                Select a text/code file to copy into a document.
              </div>
            </DialogHeader>

            <div className="space-y-3">
              <input
                className="input"
                value={importQuery}
                onChange={(e) => setImportQuery(e.target.value)}
                placeholder="Search files (name or path)…"
              />

              {importLoading ? (
                <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Loading files…
                </div>
              ) : importError ? (
                <div className="text-sm" style={{ color: "var(--accent-error)" }}>
                  {importError}
                </div>
              ) : filteredImportFiles.length === 0 ? (
                <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                  No files match your search.
                </div>
              ) : (
                <div
                  className="space-y-2 max-h-[50vh] overflow-y-auto pr-1"
                  role="list"
                  aria-label="Files"
                >
                  {filteredImportFiles.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      className="btn btn-secondary w-full justify-start"
                      onClick={() => void handleImportSelect(file)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: 2,
                        whiteSpace: "normal",
                      }}
                    >
                      <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                        {file.name}
                      </span>
                      <span className="text-xs font-mono" style={{ color: "var(--text-dim)" }}>
                        {file.path}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {!documents ? (
          <DocumentCardSkeleton count={4} />
        ) : documents.length === 0 ? (
          <div className="empty-state animate-fade-in" style={{ padding: "32px 16px" }}>
            <div className="empty-state-icon" aria-hidden="true"><MappedIcon name="edit" size="lg" /></div>
            <div className="empty-state-title">No documents yet</div>
            <div className="empty-state-text">
              Create your first document above
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => {
              const isActive = selectedId === doc.id;
              return (
                <button
                  key={doc.id}
                  className="task-card text-left"
                  onClick={() => setSelectedId(isActive ? null : doc.id)}
                  style={{
                    background: isActive ? "rgba(123,223,246,0.08)" : "transparent",
                  }}
                >
                  <div className="task-title">{doc.title}</div>
                  <div className="task-meta">
                    <span className="task-status">{doc.type}</span>
                    <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                      {new Date(doc.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {isActive && (
                    <div className="mt-3 space-y-2">
                      {(doc as { sourcePath?: string; sourceKind?: string }).sourcePath && (
                        <div className="text-[10px] font-mono" style={{ color: "var(--text-dim)" }}>
                          Source: {(doc as { sourcePath?: string }).sourcePath}
                        </div>
                      )}
                      <div className="text-xs whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
                        {doc.content || "No content"}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
});
