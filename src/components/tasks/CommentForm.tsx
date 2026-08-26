"use client";

import { memo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/lib/convexApi";
import { useOptimistic } from "@/hooks/useOptimistic";
import { useHotkeys } from "@/hooks/useHotkeys";
import { MappedIcon, Button } from "@/components/ui";

export const CommentForm = memo(function CommentForm({ taskId }: { taskId: string }) {
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState("");
  const createComment = useMutation(api.comments.create);

  // Optimistic comment creation
  const { execute: createOptimistic, isPending } = useOptimistic({
    mutation: async (args: {
      taskId: string;
      authorId: string;
      authorName: string;
      content: string;
      attachments?: string[];
    }) => {
      return await createComment(args);
    },
    successMessage: "Comment posted",
    errorMessage: "Failed to post comment",
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isPending) return;

    const attachmentList = attachments
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    try {
      await createOptimistic({
        taskId,
        authorId: "operator",
        authorName: "Operator",
        content: content.trim(),
        attachments: attachmentList.length > 0 ? attachmentList : undefined,
      });
      setContent("");
      setAttachments("");
    } catch (error) {
      // Error already handled by useOptimistic
      console.error("Failed to post comment", error);
    }
  };

  // Keyboard shortcut: Cmd+Enter to submit
  useHotkeys(
    "mod+enter",
    () => {
      if (content.trim() && !isPending) {
        onSubmit(new Event("submit") as unknown as React.FormEvent);
      }
    },
    { enabled: true }
  );

  return (
    <form onSubmit={onSubmit} className="section-card">
      <div className="section-header">
        <h3 className="section-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <MappedIcon name="edit" size="sm" />
          Add Comment
        </h3>
      </div>
      <div className="section-body">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write an update or note..."
          className="input textarea"
        />
        <input
          value={attachments}
          onChange={(e) => setAttachments(e.target.value)}
          placeholder="Attachments (comma-separated paths or URLs)"
          className="input mt-3"
        />
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Press ⌘+Enter to post
          </span>
          <Button
            type="submit"
            disabled={!content.trim() || isPending}
            variant="default"
            size="sm"
            loading={isPending}
          >
            {isPending ? "Posting..." : "Post Comment"}
          </Button>
        </div>
      </div>
    </form>
  );
});
