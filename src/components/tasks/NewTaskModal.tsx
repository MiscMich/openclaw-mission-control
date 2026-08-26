"use client";

import { memo, useState, useCallback, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convexApi";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useOptimistic } from "@/hooks/useOptimistic";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Textarea,
  Select,
} from "@/components/ui";

// =============================================================================
// TYPES
// =============================================================================

type Agent = {
  id: string;
  name: string;
};

interface NewTaskModalProps {
  open: boolean;
  onClose: () => void;
}

// =============================================================================
// PRIORITY OPTIONS (hoisted outside per rerender-memo-with-default-value)
// =============================================================================

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const NewTaskModal = memo(function NewTaskModal({
  open,
  onClose,
}: NewTaskModalProps) {
  const agentsResult = useQuery(api.agents.list, {});
  const agents = useMemo(() => (agentsResult ?? []) as Agent[], [agentsResult]);
  const createTask = useMutation(api.tasks.create);
  const setSessionKey = useMutation(api.tasks.setSessionKey);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [assigned, setAssigned] = useState("");
  const [autoSpawn, setAutoSpawn] = useState(false);

  // Build agent options for select (memoized per rerender-memo rule)
  const agentOptions = useMemo(() => {
    return [
      { value: "", label: "Unassigned" },
      ...agents.map((agent) => ({
        value: agent.id,
        label: agent.name,
      })),
    ];
  }, [agents]);

  const resetForm = useCallback(() => {
    setTitle("");
    setDescription("");
    setPriority("normal");
    setAssigned("");
    setAutoSpawn(false);
  }, []);

  // Stable form handlers (per rerender-functional-setstate rule)
  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value),
    []
  );

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value),
    []
  );

  const handlePriorityChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => setPriority(e.target.value),
    []
  );

  const handleAssignedChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextAssignee = e.target.value;
    setAssigned(nextAssignee);
    if (!nextAssignee) {
      setAutoSpawn(false);
    }
  }, []);

  const handleAutoSpawnChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setAutoSpawn(e.target.checked),
    []
  );

  // Optimistic task creation
  const { execute: createOptimistic, isPending } = useOptimistic({
    mutation: async (args: {
      title: string;
      description: string;
      priority: "low" | "normal" | "high" | "urgent";
      assigneeId?: string;
    }) => {
      return await createTask({
        ...args,
        createdBy: "operator",
      });
    },
    successMessage: `Task created`,
    errorMessage: "Failed to create task",
  });

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!title.trim() || isPending) return;

      const trimmedTitle = title.trim();
      const trimmedDescription = description.trim();
      const assigneeId = assigned;
      const shouldSpawn = autoSpawn && !!assigneeId;

      try {
        const result = await createOptimistic({
          title: trimmedTitle,
          description: trimmedDescription,
          priority: priority as "low" | "normal" | "high" | "urgent",
          assigneeId: assigneeId || undefined,
        });

        if (shouldSpawn && result?.id) {
          const taskId = result.id;
          const prompt = `Complete this task: ${trimmedTitle}. Description: ${
            trimmedDescription || "(none)"
          }`;

          // Fire and forget - don't block modal close
          void (async () => {
            try {
              const response = await fetch("/api/agents/spawn", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ agentId: assigneeId, taskId, prompt }),
              });

              const payload = (await response.json().catch(() => null)) as
                | { success?: boolean; error?: string; sessionId?: unknown; sessionKey?: unknown }
                | null;
              if (!response.ok || !payload?.success) {
                throw new Error(payload?.error || `Spawn request failed (${response.status})`);
              }

              const resolvedSessionKey =
                typeof payload.sessionKey === "string" && payload.sessionKey.trim()
                  ? payload.sessionKey
                  : typeof payload.sessionId === "string" && payload.sessionId.trim()
                    ? payload.sessionId
                    : null;
              if (!resolvedSessionKey) {
                throw new Error("Spawn returned no session key");
              }

              await setSessionKey({ id: taskId, sessionKey: resolvedSessionKey });

              toast.success("Agent launched", {
                description: `Assigned agent started work on "${trimmedTitle}".`,
              });
            } catch (error) {
              toast.error("Task created, but agent launch failed", {
                description:
                  error instanceof Error ? error.message : "Unknown spawn error",
              });
            }
          })();
        }

        resetForm();
        onClose();
      } catch (error) {
        // Error already handled by useOptimistic
        console.error("Failed to create task", error);
      }
    },
    [
      title,
      description,
      priority,
      assigned,
      autoSpawn,
      isPending,
      createOptimistic,
      setSessionKey,
      resetForm,
      onClose,
    ]
  );

  // Keyboard shortcuts - Cmd+Enter to submit
  useHotkeys(
    "mod+enter",
    () => {
      if (open && title.trim() && !isPending) {
        void handleSubmit();
      }
    },
    { enabled: open }
  );

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        resetForm();
        onClose();
      }
    },
    [onClose, resetForm]
  );

  const isValid = title.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
          <DialogDescription>Add a new task for your agents</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-5"
        >
          {/* Title */}
          <Input
            label="Title"
            value={title}
            onChange={handleTitleChange}
            placeholder="What needs to be done?"
            required
            autoFocus
          />

          {/* Description */}
          <Textarea
            label="Description"
            value={description}
            onChange={handleDescriptionChange}
            placeholder="Add more details..."
            rows={3}
          />

          {/* Priority & Assignment */}
          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="Priority"
              value={priority}
              onChange={handlePriorityChange}
              options={PRIORITY_OPTIONS}
            />

            <div>
              <Select
                label="Assign to"
                value={assigned}
                onChange={handleAssignedChange}
                options={agentOptions}
              />

              {assigned !== "" && (
                <label
                  className="mt-3 flex items-center gap-2 text-sm select-none cursor-pointer"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <input
                    type="checkbox"
                    checked={autoSpawn}
                    onChange={handleAutoSpawnChange}
                    className="h-4 w-4 rounded border-[var(--border-default)]"
                    style={{ accentColor: "var(--accent-primary)" }}
                  />
                  <span>Start agent immediately</span>
                </label>
              )}
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => {
              resetForm();
              onClose();
            }}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              void handleSubmit();
            }}
            loading={isPending}
            disabled={!isValid || isPending}
          >
            {isPending ? "Creating..." : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export default NewTaskModal;
