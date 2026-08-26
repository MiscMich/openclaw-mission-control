"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convexApi";
import { TimeAgo } from "@/components/ui/TimeAgo";
import { MappedIcon, type MappedIconName } from "@/components/ui";

const DOC_TYPES: { id: string; label: string; icon: MappedIconName }[] = [
  { id: "deliverable", label: "Deliverable", icon: "files" },
  { id: "research", label: "Research", icon: "search" },
  { id: "protocol", label: "Protocol", icon: "tasks" },
  { id: "notes", label: "Notes", icon: "edit" },
  { id: "report", label: "Report", icon: "chart" },
];

export const DocumentsCenter = memo(function DocumentsCenter({
  taskId,
  initialSelectedId,
}: {
  taskId?: string;
  initialSelectedId?: string;
}) {
  const documents = useQuery(
    taskId ? api.documents.listByTask : api.documents.listRecent,
    taskId ? { taskId } : { limit: 50 }
  );
  const agents = useQuery(api.agents.list, {});
  
  const createDoc = useMutation(api.documents.create);
  const deleteDoc = useMutation(api.documents.remove);

  const [view, setView] = useState<"list" | "create">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState("deliverable");
  const [saving, setSaving] = useState(false);

  const agentsById = useMemo(() => {
    const map = new Map<string, { name: string }>();
    if (!agents) return map;
    for (const agent of agents) {
      map.set(agent.id, { name: agent.name });
    }
    return map;
  }, [agents]);

  const filteredDocs = useMemo(() => {
    if (!documents) return null;
    let filtered = documents;

    if (typeFilter) {
      filtered = filtered.filter((d) => d.type === typeFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.title.toLowerCase().includes(query) ||
          d.content.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [documents, typeFilter, searchQuery]);

  const selectedDoc = useMemo(() => {
    if (!selectedId || !documents) return null;
    return documents.find((d) => d.id === selectedId) ?? null;
  }, [selectedId, documents]);

  const selectedSourcePath = useMemo(() => {
    if (!selectedDoc) return null;
    const maybe = (selectedDoc as { sourcePath?: unknown }).sourcePath;
    return typeof maybe === "string" && maybe.trim() ? maybe : null;
  }, [selectedDoc]);

  const selectedSourceHref = useMemo(() => {
    if (!selectedSourcePath) return null;
    const parts = selectedSourcePath.split("/").filter(Boolean);
    const dirPath = parts.length <= 1 ? "." : parts.slice(0, -1).join("/");
    return `/?tab=workspace&path=${encodeURIComponent(dirPath)}&open=${encodeURIComponent(
      selectedSourcePath
    )}`;
  }, [selectedSourcePath]);

  useEffect(() => {
    if (!initialSelectedId || !documents) return;
    if (!documents.some((doc) => doc.id === initialSelectedId)) return;
    setView("list");
    setSelectedId(initialSelectedId);
  }, [documents, initialSelectedId]);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createDoc({
        title,
        content,
        type,
        createdBy: "planner",
        taskId,
      });
      setTitle("");
      setContent("");
      setType("deliverable");
      setView("list");
    } catch (err) {
      console.error("Failed to create document:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this document?")) return;
    try {
      await deleteDoc({ id });
      if (selectedId === id) setSelectedId(null);
    } catch (err) {
      console.error("Failed to delete document:", err);
    }
  };

  const typeStats = useMemo(() => {
    if (!documents) return {};
    const stats: Record<string, number> = {};
    for (const doc of documents) {
      stats[doc.type] = (stats[doc.type] ?? 0) + 1;
    }
    return stats;
  }, [documents]);

  return (
    <section className="section-card documents-center">
      <div className="section-header">
        <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <MappedIcon name="files" size="sm" />
          Documents
        </h2>
        <div className="doc-header-actions">
          <span className="section-badge">{documents?.length ?? 0}</span>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setView(view === "create" ? "list" : "create");
              setSelectedId(null);
            }}
          >
            {view === "create" ? "Cancel" : "New Doc"}
          </button>
        </div>
      </div>

      {view === "create" ? (
        <div className="doc-form">
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Document title"
            autoFocus
          />
          <textarea
            className="textarea doc-content-input"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your document content..."
            rows={8}
          />
          <div className="doc-form-footer">
            <div className="doc-type-select">
              {DOC_TYPES.map((t) => (
                <button
                  key={t.id}
                  className={`doc-type-btn ${type === t.id ? "active" : ""}`}
                  onClick={() => setType(t.id)}
                >
                  <span className="doc-type-icon" aria-hidden="true"><MappedIcon name={t.icon} size="sm" /></span>
                  <span className="doc-type-label">{t.label}</span>
                </button>
              ))}
            </div>
            <button
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={saving || !title.trim()}
            >
              {saving ? "Creating..." : "Create Document"}
            </button>
          </div>
        </div>
      ) : (
        <div className="doc-content">
          {/* Filters */}
          <div className="doc-filters">
            <input
              className="doc-search"
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="doc-type-filters">
              <button
                className={`doc-type-filter ${!typeFilter ? "active" : ""}`}
                onClick={() => setTypeFilter(null)}
              >
                All ({documents?.length ?? 0})
              </button>
              {DOC_TYPES.filter((t) => typeStats[t.id]).map((t) => (
                <button
                  key={t.id}
                  className={`doc-type-filter ${typeFilter === t.id ? "active" : ""}`}
                  onClick={() => setTypeFilter(t.id)}
                >
                  <MappedIcon name={t.icon} size="xs" /> {typeStats[t.id]}
                </button>
              ))}
            </div>
          </div>

          <div className="doc-split">
            {/* Document List */}
            <div className="doc-list">
              {!filteredDocs ? (
                <div className="doc-loading">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="skeleton doc-skeleton" />
                  ))}
                </div>
              ) : filteredDocs.length === 0 ? (
                <div className="doc-empty">
                  <div className="doc-empty-icon" aria-hidden="true"><MappedIcon name="notification" size="lg" /></div>
                  <div className="doc-empty-title">
                    {searchQuery ? "No matching documents" : "No documents yet"}
                  </div>
                  <div className="doc-empty-sub">
                    {searchQuery
                      ? "Try a different search term"
                      : 'Click "New Doc" to create your first document'}
                  </div>
                </div>
              ) : (
                filteredDocs.map((doc) => {
                  const docType = DOC_TYPES.find((t) => t.id === doc.type);
                  const author = agentsById.get(doc.createdBy);
                  const isSelected = selectedId === doc.id;

                  return (
                    <button
                      key={doc.id}
                      className={`doc-item ${isSelected ? "active" : ""}`}
                      onClick={() => setSelectedId(isSelected ? null : doc.id)}
                    >
                      <div className="doc-item-icon" aria-hidden="true">
                        <MappedIcon name={docType?.icon ?? "files"} size="sm" />
                      </div>
                      <div className="doc-item-body">
                        <div className="doc-item-title">{doc.title}</div>
                        <div className="doc-item-meta">
                          <span className="doc-item-type">{doc.type}</span>
                          <span className="doc-item-author">
                            {author?.name ?? doc.createdBy}
                          </span>
                          <span className="doc-item-time">
                            <TimeAgo timestamp={doc.createdAt} />
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Document Viewer */}
            {selectedDoc && (
              <div className="doc-viewer">
                <div className="doc-viewer-header">
                  <div className="doc-viewer-title">{selectedDoc.title}</div>
                  <button
                    className="doc-delete-btn"
                    onClick={() => handleDelete(selectedDoc.id)}
                    title="Delete document"
                  >
                    <MappedIcon name="close" size="sm" />
                  </button>
                </div>
                <div className="doc-viewer-meta">
                  <span className="doc-viewer-type">
                    <MappedIcon name={DOC_TYPES.find((t) => t.id === selectedDoc.type)?.icon ?? "files"} size="xs" />{" "}
                    {selectedDoc.type}
                  </span>
                  <span className="doc-viewer-author">
                    by {agentsById.get(selectedDoc.createdBy)?.name ?? selectedDoc.createdBy}
                  </span>
                  <span className="doc-viewer-date">
                    Created <TimeAgo timestamp={selectedDoc.createdAt} />
                  </span>
                </div>
                {selectedSourcePath && selectedSourceHref && (
                  <div className="doc-viewer-source">
                    <a className="btn btn-primary btn-sm" href={selectedSourceHref}>
                      Open in Files
                    </a>
                    <div className="doc-viewer-source-path" title={selectedSourcePath}>
                      {selectedSourcePath}
                    </div>
                  </div>
                )}
                <div className="doc-viewer-content">
                  {selectedDoc.content || (
                    <span className="doc-no-content">No content</span>
                  )}
                </div>
                {selectedDoc.taskId && (
                  <a
                    href={`/tasks/${selectedDoc.taskId}`}
                    className="doc-viewer-task"
                  >
                    <MappedIcon name="tasks" size="xs" /> View Related Task
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .documents-center {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .doc-header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .doc-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 20px;
        }
        .doc-content-input {
          min-height: 200px;
          resize: vertical;
        }
        .doc-form-footer {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .doc-type-select {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .doc-type-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-md);
          color: var(--text-muted);
          font-size: 12px;
          cursor: pointer;
          transition: background-color var(--transition-fast),
                      border-color var(--transition-fast),
                      color var(--transition-fast);
        }
        .doc-type-btn:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: var(--chrome);
        }
        .doc-type-btn.active {
          background: var(--accent-soft);
          border-color: var(--accent-strong);
          color: var(--accent);
        }
        .doc-type-icon {
          font-size: 14px;
        }
        .doc-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .doc-filters {
          display: flex;
          gap: 12px;
          padding: 12px 20px;
          border-bottom: 1px solid var(--hairline);
          flex-wrap: wrap;
        }
        .doc-search {
          flex: 1;
          min-width: 200px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-md);
          padding: 8px 12px;
          color: var(--text-primary);
          font-size: 12px;
        }
        .doc-search:focus {
          outline: none;
          border-color: var(--accent-strong);
        }
        .doc-type-filters {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .doc-type-filter {
          padding: 6px 10px;
          background: transparent;
          border: 1px solid var(--hairline);
          border-radius: var(--radius-sm);
          color: var(--text-muted);
          font-size: 11px;
          cursor: pointer;
          transition: background-color var(--transition-fast),
                      border-color var(--transition-fast),
                      color var(--transition-fast);
        }
        .doc-type-filter:hover {
          background: rgba(255, 255, 255, 0.04);
        }
        .doc-type-filter.active {
          background: var(--accent-soft);
          border-color: var(--accent-strong);
          color: var(--accent);
        }
        .doc-split {
          flex: 1;
          display: flex;
          overflow: hidden;
        }
        .doc-list {
          flex: 1;
          overflow-y: auto;
          padding: 12px 16px;
          border-right: 1px solid var(--hairline);
        }
        .doc-loading {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .doc-skeleton {
          height: 64px;
          border-radius: var(--radius-md);
        }
        .doc-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px;
          text-align: center;
        }
        .doc-empty-icon {
          font-size: 40px;
          margin-bottom: 12px;
          opacity: 0.5;
        }
        .doc-empty-title {
          font-size: 13px;
          color: var(--text-muted);
          margin-bottom: 4px;
        }
        .doc-empty-sub {
          font-size: 11px;
          color: var(--text-dim);
        }
        .doc-item {
          display: flex;
          gap: 12px;
          width: 100%;
          padding: 12px 14px;
          margin-bottom: 8px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-md);
          cursor: pointer;
          text-align: left;
          transition: background-color var(--transition-normal) cubic-bezier(0.4, 0, 0.2, 1),
                      border-color var(--transition-normal) cubic-bezier(0.4, 0, 0.2, 1),
                      transform var(--transition-normal) cubic-bezier(0.4, 0, 0.2, 1),
                      box-shadow var(--transition-normal) cubic-bezier(0.4, 0, 0.2, 1);
        }
        .doc-item:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: var(--chrome-strong);
          transform: translateX(4px);
        }
        .doc-item:active {
          transform: translateX(2px);
          transition: transform 50ms ease;
        }
        .doc-item.active {
          background: var(--accent-soft);
          border-color: var(--accent-strong);
          box-shadow: 0 0 0 1px var(--accent-soft);
        }
        .doc-item-icon {
          font-size: 20px;
          flex-shrink: 0;
        }
        .doc-item-body {
          flex: 1;
          min-width: 0;
        }
        .doc-item-title {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .doc-item-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 4px;
          font-size: 10px;
          color: var(--text-dim);
        }
        .doc-item-type {
          padding: 2px 6px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: var(--radius-xs);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .doc-viewer {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 20px;
          overflow: hidden;
        }
        .doc-viewer-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .doc-viewer-title {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .doc-delete-btn {
          background: transparent;
          border: 1px solid var(--hairline);
          border-radius: var(--radius-sm);
          padding: 6px 10px;
          cursor: pointer;
          opacity: 0.6;
          transition: opacity var(--transition-fast),
                      border-color var(--transition-fast);
        }
        .doc-delete-btn:hover {
          opacity: 1;
          border-color: var(--accent-red);
        }
        .doc-viewer-meta {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 11px;
          color: var(--text-dim);
          margin-bottom: 16px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--hairline);
        }
        .doc-viewer-source {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 16px;
        }
        .doc-viewer-source-path {
          font-family: var(--font-mono), ui-monospace, SFMono-Regular, Menlo, Monaco,
            Consolas, "Liberation Mono", "Courier New", monospace;
          font-size: 11px;
          color: var(--text-dim);
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-sm);
          padding: 6px 10px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .doc-viewer-type {
          padding: 3px 8px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: var(--radius-sm);
        }
        .doc-viewer-content {
          flex: 1;
          overflow-y: auto;
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.7;
          white-space: pre-wrap;
        }
        .doc-no-content {
          color: var(--text-dim);
          font-style: italic;
        }
        .doc-viewer-task {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-top: 16px;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.04);
          border-radius: var(--radius-md);
          font-size: 12px;
          color: var(--text-muted);
          text-decoration: none;
          transition: background-color var(--transition-fast),
                      color var(--transition-fast);
        }
        .doc-viewer-task:hover {
          background: rgba(255, 255, 255, 0.08);
          color: var(--text-secondary);
        }
      `}</style>
    </section>
  );
});
