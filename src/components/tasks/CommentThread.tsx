"use client";

import { memo } from "react";
import { TimeAgo } from "@/components/ui/TimeAgo";
import { MappedIcon } from "@/components/ui";
import { useQuery } from "convex/react";
import { api } from "@/lib/convexApi";

type Comment = {
  id: string;
  authorName: string;
  content: string;
  attachments?: string[];
  createdAt: number;
};

export const CommentThread = memo(function CommentThread({ taskId }: { taskId: string }) {
  const comments = useQuery(api.comments.listByTask, { taskId }) as Comment[] | undefined;
  const loading = comments === undefined;

  return (
    <div className="section-card">
      <div className="section-header">
        <h3 className="section-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <MappedIcon name="comment" size="sm" />
          Comments
        </h3>
        {comments && comments.length > 0 && (
          <span className="section-badge">{comments.length}</span>
        )}
      </div>
      <div className="section-body">
        {loading || !comments ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div 
                key={i} 
                className="rounded-lg p-4"
                style={{ 
                  background: "var(--bg-floating)",
                  border: "1px solid var(--hairline)",
                  opacity: 1 - (i * 0.2)
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="skeleton h-4 w-24 rounded" />
                  <div className="skeleton h-3 w-16 rounded" />
                </div>
                <div className="space-y-2">
                  <div className="skeleton h-3 w-full rounded" />
                  <div className="skeleton h-3 w-3/4 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="empty-state animate-fade-in" style={{ padding: "32px 16px" }}>
            <div className="empty-state-icon" aria-hidden="true"><MappedIcon name="comment" size="lg" /></div>
            <div className="empty-state-title">No comments yet</div>
            <div className="empty-state-text">
              Be the first to add a comment below
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {comments.map((comment) => (
              <div 
                key={comment.id} 
                className="rounded-lg p-4"
                style={{ 
                  background: "var(--bg-floating)",
                  border: "1px solid var(--border-subtle)"
                }}
              >
                <div className="flex items-center justify-between">
                  <div 
                    className="text-sm font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {comment.authorName}
                  </div>
                  <TimeAgo timestamp={comment.createdAt} />
                </div>
                <p 
                  className="mt-2 text-sm whitespace-pre-wrap leading-relaxed"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {comment.content}
                </p>
                {comment.attachments && comment.attachments.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {comment.attachments.map((item, idx) => (
                      <span
                        key={`${comment.id}-att-${idx}`}
                        className="task-status"
                        style={{ fontSize: 9 }}
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
