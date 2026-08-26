"use client";

import { Badge, Button, GlassPanel, TimeAgo, type BadgeVariant } from "@/components/ui";
import { cn } from "@/lib/utils";

export type WorkflowRunBoardColumnKind = "needs_attention" | "worker" | "done";

export type WorkflowRunBoardStatus =
  | "needs_attention"
  | "queued"
  | "waiting"
  | "running"
  | "paused"
  | "done"
  | "completed"
  | "failed"
  | "cancelled"
  | (string & {});

export interface WorkflowRunBoardColumn {
  id: string;
  title: string;
  kind: WorkflowRunBoardColumnKind;
  description?: string;
}

export interface WorkflowRunBoardPreview {
  title?: string;
  summary?: string;
  note?: string;
}

export interface WorkflowRunBoardRun {
  id: string;
  title: string;
  status: WorkflowRunBoardStatus;
  summary?: string | null;
  updatedAt?: number | string | null;
  executionLockText?: string | null;
  preview?: WorkflowRunBoardPreview;
}

export interface WorkflowRunBoardProps {
  columns: readonly WorkflowRunBoardColumn[];
  runsByColumn: Readonly<Partial<Record<string, readonly WorkflowRunBoardRun[]>>>;
  className?: string;
  emptyColumnCopy?: string;
  getEmptyColumnCopy?: (column: WorkflowRunBoardColumn) => string;
  slotSettingsLabel?: string;
  archiveLabel?: string;
  onOpenRun?: (run: WorkflowRunBoardRun, column: WorkflowRunBoardColumn) => void;
  onOpenSlotSettings?: (column: WorkflowRunBoardColumn) => void;
  onArchiveRun?: (run: WorkflowRunBoardRun, column: WorkflowRunBoardColumn) => void;
}

interface WorkflowRunCardProps {
  run: WorkflowRunBoardRun;
  column: WorkflowRunBoardColumn;
  archiveLabel: string;
  onOpenRun?: (run: WorkflowRunBoardRun, column: WorkflowRunBoardColumn) => void;
  onArchiveRun?: (run: WorkflowRunBoardRun, column: WorkflowRunBoardColumn) => void;
}

type StatusMeta = {
  label: string;
  variant: BadgeVariant;
};

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase();
}

function toStatusLabel(status: string): string {
  const normalized = status.replace(/_/g, " ").trim();
  if (!normalized) return "Unknown";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function statusToMeta(status: string): StatusMeta {
  const normalized = normalizeStatus(status);

  if (normalized === "running" || normalized === "in_progress") {
    return { label: "In progress", variant: "primary" };
  }

  if (
    normalized === "needs_attention" ||
    normalized === "needs_human" ||
    normalized === "blocked" ||
    normalized === "review"
  ) {
    return { label: "Needs attention", variant: "warning" };
  }

  if (normalized === "done" || normalized === "completed" || normalized === "success") {
    return { label: "Done", variant: "success" };
  }

  if (normalized === "failed" || normalized === "error") {
    return { label: "Issue", variant: "error" };
  }

  if (normalized === "paused") {
    return { label: "Paused", variant: "secondary" };
  }

  if (normalized === "queued" || normalized === "waiting" || normalized === "pending") {
    return { label: "Waiting", variant: "secondary" };
  }

  if (normalized === "cancelled" || normalized === "canceled") {
    return { label: "Stopped", variant: "secondary" };
  }

  return { label: toStatusLabel(status), variant: "default" };
}

function cleanCopy(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function defaultEmptyColumnCopy(column: WorkflowRunBoardColumn): string {
  if (column.kind === "needs_attention") return "No runs need attention.";
  if (column.kind === "done") return "No completed runs yet.";
  return "No runs in this column.";
}

function WorkflowRunCard({
  run,
  column,
  archiveLabel,
  onOpenRun,
  onArchiveRun,
}: WorkflowRunCardProps) {
  const status = statusToMeta(run.status);
  const summary = cleanCopy(run.summary) ?? "No summary yet.";
  const executionLockText = cleanCopy(run.executionLockText) ?? "Waiting for first update";
  const previewTitle = cleanCopy(run.preview?.title) ?? "Quick preview";
  const previewSummary = cleanCopy(run.preview?.summary) ?? summary;
  const previewNote = cleanCopy(run.preview?.note) ?? `Current status: ${executionLockText}`;
  const showArchiveAction = column.kind === "done" && typeof onArchiveRun === "function";

  return (
    <div className={cn("wf-board-card-shell", showArchiveAction && "wf-board-card-shell--archiveable")}>
      <button
        type="button"
        className="wf-board-card"
        onClick={() => onOpenRun?.(run, column)}
        aria-label={`Open ${run.title}. Status: ${status.label}.`}
      >
        <div className="wf-board-card-main">
          <div className="wf-board-card-title-row">
            <h4 className="wf-board-card-title">{run.title}</h4>
            <Badge variant={status.variant} size="sm">
              {status.label}
            </Badge>
          </div>

          <p className="wf-board-card-summary">{summary}</p>

          <div className="wf-board-card-meta">
            <span className="wf-board-meta-label">Last update</span>
            <TimeAgo timestamp={run.updatedAt} className="wf-board-time-ago" />
          </div>

          <div className="wf-board-card-lock" title={executionLockText}>
            Current status: {executionLockText}
          </div>
        </div>

        <div className="wf-board-preview" aria-hidden="true">
          <div className="wf-board-preview-title">{previewTitle}</div>
          <p className="wf-board-preview-summary">{previewSummary}</p>
          <p className="wf-board-preview-note">{previewNote}</p>
        </div>
      </button>

      {showArchiveAction ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="wf-board-archive-btn"
          onClick={() => onArchiveRun?.(run, column)}
        >
          {archiveLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function WorkflowRunBoard({
  columns,
  runsByColumn,
  className,
  emptyColumnCopy,
  getEmptyColumnCopy,
  slotSettingsLabel = "Slot settings",
  archiveLabel = "Archive",
  onOpenRun,
  onOpenSlotSettings,
  onArchiveRun,
}: WorkflowRunBoardProps) {
  return (
    <div className={cn("wf-board-root", className)}>
      <div className="wf-board-scroll">
        <div className="wf-board-track" role="list" aria-label="Workflow run board">
          {columns.map((column) => {
            const runs = (runsByColumn[column.id] ?? []).filter(
              (run): run is WorkflowRunBoardRun =>
                !!run && typeof run.id === "string" && run.id.trim().length > 0
            );
            const showSlotSettingsAction = column.kind === "worker" && typeof onOpenSlotSettings === "function";
            const emptyCopy =
              getEmptyColumnCopy?.(column) ?? emptyColumnCopy ?? defaultEmptyColumnCopy(column);

            return (
              <GlassPanel key={column.id} padding="none" className="wf-board-column" role="listitem">
                <div className="wf-board-column-header">
                  <div className="wf-board-column-copy">
                    <h3 className="wf-board-column-title">{column.title}</h3>
                    {column.description ? (
                      <p className="wf-board-column-description">{column.description}</p>
                    ) : null}
                  </div>

                  <div className="wf-board-column-actions">
                    <Badge variant="secondary" size="sm" className="wf-board-column-count">
                      {runs.length}
                    </Badge>
                    {showSlotSettingsAction ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="wf-board-settings-btn"
                        onClick={() => onOpenSlotSettings?.(column)}
                      >
                        {slotSettingsLabel}
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="wf-board-column-body">
                  {runs.length === 0 ? (
                    <div className="wf-board-empty">{emptyCopy}</div>
                  ) : (
                    runs.map((run) => (
                      <WorkflowRunCard
                        key={run.id}
                        run={run}
                        column={column}
                        archiveLabel={archiveLabel}
                        onOpenRun={onOpenRun}
                        onArchiveRun={onArchiveRun}
                      />
                    ))
                  )}
                </div>
              </GlassPanel>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default WorkflowRunBoard;
