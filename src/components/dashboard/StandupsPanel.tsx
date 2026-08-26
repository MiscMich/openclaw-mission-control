"use client";

import { memo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convexApi";
import { TimeAgo } from "@/components/ui/TimeAgo";
import { MappedIcon, Button } from "@/components/ui";

export const StandupsPanel = memo(function StandupsPanel() {
  const standups = useQuery(api.standups.list, { limit: 14 });
  const [generating, setGenerating] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const generateStandup = async () => {
    setGenerating(true);
    try {
      await fetch("/api/standups/generate", { method: "POST" });
    } catch (err) {
      console.error("Failed to generate standup:", err);
    } finally {
      setGenerating(false);
    }
  };

  const selectedStandup = selectedDate
    ? standups?.find((s) => s.date === selectedDate)
    : standups?.[0];

  return (
    <section className="section-card standups-panel">
      <div className="section-header">
        <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <MappedIcon name="chart" size="sm" />
          Daily Standups
        </h2>
        <Button
          variant="default"
          size="sm"
          onClick={generateStandup}
          disabled={generating}
        >
          {generating ? "Generating..." : "Generate Today"}
        </Button>
      </div>

      <div className="standups-content">
        {/* Date Selector */}
        <div className="standups-dates">
          {!standups ? (
            <div className="standups-dates-loading">
              {[...Array(7)].map((_, i) => (
                <div key={i} className="skeleton standup-date-skeleton" />
              ))}
            </div>
          ) : standups.length === 0 ? (
            <div className="standups-empty-dates">No standups yet</div>
          ) : (
            <div className="standups-date-list">
              {standups.map((standup) => {
                const isSelected =
                  selectedDate === standup.date ||
                  (!selectedDate && standup === standups[0]);
                const date = new Date(standup.date + "T00:00:00");
                const dayName = date.toLocaleDateString("en-US", {
                  weekday: "short",
                });
                const monthDay = date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });

                return (
                  <button
                    key={standup.id}
                    className={`standup-date-btn ${isSelected ? "active" : ""}`}
                    onClick={() => setSelectedDate(standup.date)}
                  >
                    <span className="standup-date-day">{dayName}</span>
                    <span className="standup-date-full">{monthDay}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Standup Content */}
        <div className="standup-viewer">
          {!standups ? (
            <div className="standup-viewer-loading">
              <div className="skeleton h-6 w-48 mb-4" />
              <div className="skeleton h-4 w-full mb-2" />
              <div className="skeleton h-4 w-3/4 mb-2" />
              <div className="skeleton h-4 w-5/6 mb-4" />
              <div className="skeleton h-4 w-full mb-2" />
              <div className="skeleton h-4 w-2/3" />
            </div>
          ) : !selectedStandup ? (
            <div className="standup-viewer-empty">
              <div className="standup-empty-icon" aria-hidden="true"><MappedIcon name="notification" size="lg" /></div>
              <div className="standup-empty-title">No standups yet</div>
              <div className="standup-empty-sub">
                Click &quot;Generate Today&quot; to create your first standup
              </div>
            </div>
          ) : (
            <>
              <div className="standup-viewer-header">
                <span className="standup-viewer-date">
                  {new Date(selectedStandup.date + "T00:00:00").toLocaleDateString(
                    "en-US",
                    {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    }
                  )}
                </span>
                <span className="standup-viewer-time">
                  <TimeAgo timestamp={selectedStandup.createdAt} />
                </span>
              </div>
              <div className="standup-viewer-content">
                {formatStandupContent(selectedStandup.summary)}
              </div>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        .standups-panel {
          display: flex;
          flex-direction: column;
        }
        .standups-content {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 18px 20px 22px;
        }
        .standups-dates {
          border-bottom: 1px solid var(--hairline);
          padding-bottom: 16px;
        }
        .standups-dates-loading {
          display: flex;
          gap: 8px;
          overflow-x: auto;
        }
        .standup-date-skeleton {
          width: 60px;
          height: 48px;
          border-radius: var(--radius-md);
          flex-shrink: 0;
        }
        .standups-empty-dates {
          text-align: center;
          padding: 12px;
          color: var(--text-dim);
          font-size: 12px;
        }
        .standups-date-list {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 4px;
        }
        .standups-date-list::-webkit-scrollbar {
          height: 4px;
        }
        .standups-date-list::-webkit-scrollbar-thumb {
          background: var(--chrome);
          border-radius: var(--radius-full);
        }
        .standup-date-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: background-color var(--transition-normal) cubic-bezier(0.4, 0, 0.2, 1),
                      border-color var(--transition-normal) cubic-bezier(0.4, 0, 0.2, 1),
                      transform var(--transition-normal) cubic-bezier(0.4, 0, 0.2, 1),
                      box-shadow var(--transition-normal) cubic-bezier(0.4, 0, 0.2, 1);
          flex-shrink: 0;
        }
        .standup-date-btn:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: var(--chrome-strong);
          transform: translateY(-2px);
        }
        .standup-date-btn:active {
          transform: translateY(0);
          transition: transform 50ms ease;
        }
        .standup-date-btn.active {
          background: var(--accent-soft);
          border-color: var(--accent-strong);
          box-shadow: 0 0 12px rgba(123, 223, 246, 0.2);
        }
        .standup-date-day {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-dim);
        }
        .standup-date-btn.active .standup-date-day {
          color: var(--accent);
        }
        .standup-date-full {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-top: 2px;
        }
        .standup-date-btn.active .standup-date-full {
          color: var(--text-primary);
        }
        .standup-viewer {
          flex: 1;
          min-height: 200px;
        }
        .standup-viewer-loading {
          padding: 16px 0;
        }
        .standup-viewer-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px;
          text-align: center;
        }
        .standup-empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
          opacity: 0.5;
        }
        .standup-empty-title {
          font-size: 14px;
          color: var(--text-muted);
          margin-bottom: 4px;
        }
        .standup-empty-sub {
          font-size: 12px;
          color: var(--text-dim);
        }
        .standup-viewer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        .standup-viewer-date {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .standup-viewer-time {
          font-size: 11px;
          color: var(--text-dim);
        }
        .standup-viewer-content {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.7;
          max-height: 360px;
          overflow-y: auto;
          padding-right: 8px;
        }
        .standup-viewer-content::-webkit-scrollbar {
          width: 4px;
        }
        .standup-viewer-content::-webkit-scrollbar-thumb {
          background: var(--chrome);
          border-radius: var(--radius-full);
        }
      `}</style>
    </section>
  );
});

function formatStandupContent(summary: string) {
  // Split into sections and format with enhanced markdown support
  const lines = summary.split("\n");
  const elements: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    // Section headers (check for common standup section patterns)
    const isSectionHeader = /^(DAILY STANDUP|COMPLETED|IN PROGRESS|BLOCKED|NEEDS REVIEW|KEY DECISIONS)/.test(line);
    if (isSectionHeader) {
      elements.push(
        <div key={i} className="standup-section-header">
          {line}
          <style jsx>{`
            .standup-section-header {
              font-weight: 700;
              font-size: 14px;
              color: var(--text-primary);
              margin-top: 20px;
              margin-bottom: 10px;
              padding-bottom: 6px;
              border-bottom: 1px solid var(--border-subtle);
            }
            .standup-section-header:first-child {
              margin-top: 0;
            }
          `}</style>
        </div>
      );
    } else if (line.startsWith("•") || line.startsWith("-") || line.startsWith("*")) {
      // Bullet items
      const content = line.replace(/^[•\-*]\s*/, "");
      elements.push(
        <div key={i} className="standup-item">
          <span className="bullet">•</span>
          <span className="content">{formatInlineMarkdown(content)}</span>
          <style jsx>{`
            .standup-item {
              display: flex;
              gap: 10px;
              margin-bottom: 6px;
              color: var(--text-secondary);
              line-height: 1.6;
            }
            .standup-item .bullet {
              color: var(--accent-primary);
              flex-shrink: 0;
              font-weight: 700;
            }
            .standup-item .content {
              flex: 1;
            }
            .standup-item :global(strong) {
              color: var(--text-primary);
              font-weight: 600;
            }
            .standup-item :global(code) {
              font-family: var(--font-mono);
              font-size: 12px;
              background: var(--bg-elevated);
              padding: 2px 6px;
              border-radius: 4px;
              color: var(--accent-primary);
            }
          `}</style>
        </div>
      );
    } else if (line.trim().match(/^#{1,6}\s/)) {
      // Markdown headers
      const level = line.match(/^(#{1,6})/)?.[1].length || 1;
      const content = line.replace(/^#{1,6}\s*/, "");
      elements.push(
        <div key={i} className={`standup-heading level-${level}`}>
          {content}
          <style jsx>{`
            .standup-heading {
              font-weight: 700;
              margin-top: 16px;
              margin-bottom: 8px;
            }
            .standup-heading.level-1 {
              font-size: 18px;
              color: var(--text-primary);
            }
            .standup-heading.level-2 {
              font-size: 16px;
              color: var(--text-primary);
            }
            .standup-heading.level-3 {
              font-size: 14px;
              color: var(--text-secondary);
            }
          `}</style>
        </div>
      );
    } else if (line.trim()) {
      // Regular text with inline markdown
      elements.push(
        <div key={i} className="standup-text">
          {formatInlineMarkdown(line)}
          <style jsx>{`
            .standup-text {
              margin-bottom: 8px;
              color: var(--text-secondary);
              line-height: 1.7;
            }
            .standup-text :global(strong) {
              color: var(--text-primary);
              font-weight: 600;
            }
            .standup-text :global(code) {
              font-family: var(--font-mono);
              font-size: 12px;
              background: var(--bg-elevated);
              padding: 2px 6px;
              border-radius: 4px;
              color: var(--accent-primary);
            }
          `}</style>
        </div>
      );
    }
  });

  return elements;
}

function formatInlineMarkdown(text: string): React.ReactNode {
  // Handle **bold** and `code` inline
  const parts: React.ReactNode[] = [];
  const remaining = text;
  let key = 0;

  const combined = /(\*\*.+?\*\*|`.+?`)/g;

  let lastIndex = 0;
  let match;

  while ((match = combined.exec(remaining)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(remaining.substring(lastIndex, match.index));
    }

    // Add formatted match
    const matchedText = match[0];
    if (matchedText.startsWith("**")) {
      const content = matchedText.slice(2, -2);
      parts.push(<strong key={key++}>{content}</strong>);
    } else if (matchedText.startsWith("`")) {
      const content = matchedText.slice(1, -1);
      parts.push(<code key={key++}>{content}</code>);
    }

    lastIndex = match.index + matchedText.length;
  }

  // Add remaining text
  if (lastIndex < remaining.length) {
    parts.push(remaining.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}
