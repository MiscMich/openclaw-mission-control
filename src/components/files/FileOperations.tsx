"use client";

import { memo, useCallback, useRef, useState } from "react";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@/components/ui";
import { toast } from "sonner";

type FileOperationsProps = {
  currentPath: string;
  selectedFile: { name: string; path: string; type: "file" | "dir" } | null;
  onRefresh: () => void;
  onFileCreated?: () => void;
  onFileDeleted?: () => void;
  onFileRenamed?: () => void;
};

export const FileOperations = memo(function FileOperations({
  currentPath,
  selectedFile,
  onRefresh,
  onFileCreated,
  onFileDeleted,
  onFileRenamed,
}: FileOperationsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deleteCloseLockRef = useRef(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createType, setCreateType] = useState<"file" | "dir">("file");
  const [createName, setCreateName] = useState("");
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateName = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return "Name is required";
    }
    if (trimmed.includes("/") || trimmed.includes("\\")) {
      return "Name cannot include path separators";
    }
    return null;
  }, []);

  const createEntry = useCallback(async () => {
    const name = createName.trim();
    const validationError = validateName(name);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const target = currentPath === "." ? name : `${currentPath}/${name}`;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/openclaw/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: target,
          type: createType,
          ...(createType === "file" ? { content: "" } : {}),
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to create item");
      }

      toast.success(createType === "file" ? "File created" : "Folder created", {
        description: `Created ${name}`,
      });

      setCreateDialogOpen(false);
      setCreateName("");
      onRefresh();
      onFileCreated?.();
    } catch (error) {
      toast.error("Failed to create", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [createName, createType, currentPath, onFileCreated, onRefresh, validateName]);

  const renameFile = useCallback(async () => {
    if (!selectedFile) return;

    const newName = renameName.trim();
    const validationError = validateName(newName);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    if (newName === selectedFile.name) {
      setRenameDialogOpen(false);
      return;
    }

    const dirPath = currentPath === "." ? "" : currentPath;
    const target = dirPath ? `${dirPath}/${newName}` : newName;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/openclaw/file", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: selectedFile.path, to: target }),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to rename");
      }

      toast.success("Renamed successfully", {
        description: `${selectedFile.name} → ${newName}`,
      });

      setRenameDialogOpen(false);
      onRefresh();
      onFileRenamed?.();
    } catch (error) {
      toast.error("Failed to rename", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedFile, renameName, validateName, currentPath, onRefresh, onFileRenamed]);

  const deleteFile = useCallback(async () => {
    if (!selectedFile) return;

    deleteCloseLockRef.current = true;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/openclaw/file?path=${encodeURIComponent(selectedFile.path)}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to delete");
      }

      toast.success("Deleted successfully", {
        description: `Deleted ${selectedFile.name}`,
      });

      setDeleteDialogOpen(false);
      onRefresh();
      onFileDeleted?.();
    } catch (error) {
      toast.error("Failed to delete", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSubmitting(false);
      deleteCloseLockRef.current = false;
    }
  }, [selectedFile, onRefresh, onFileDeleted]);

  const handleUpload = useCallback(async (files: FileList) => {
    if (files.length === 0) return;

    const toastId = toast.loading(`Uploading ${files.length} file(s)...`);

    try {
      for (const file of Array.from(files)) {
        const target = currentPath === "." ? file.name : `${currentPath}/${file.name}`;
        const formData = new FormData();
        formData.append("path", target);
        formData.append("type", "file");
        formData.append("file", file);

        const res = await fetch("/api/openclaw/file", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!data.ok) {
          throw new Error(data.error || `Failed to upload ${file.name}`);
        }
      }

      toast.success("Upload complete", {
        id: toastId,
        description: `Uploaded ${files.length} file(s)`,
      });

      onRefresh();
    } catch (error) {
      toast.error("Upload failed", {
        id: toastId,
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      // Reset to allow selecting the same file again.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [currentPath, onRefresh]);

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          mappedIcon="download"
        >
          Upload
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleUpload(e.target.files)}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setCreateType("file");
            setCreateName("");
            setCreateDialogOpen(true);
          }}
          mappedIcon="create"
        >
          New File
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setCreateType("dir");
            setCreateName("");
            setCreateDialogOpen(true);
          }}
          mappedIcon="files"
        >
          New Folder
        </Button>
      </div>

      {selectedFile && (
        <div className="flex items-center gap-2">
          <span
            className="text-xs px-2 py-1 rounded"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--text-dim)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            Selected: {selectedFile.name}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRenameName(selectedFile.name);
              setRenameDialogOpen(true);
            }}
            mappedIcon="edit"
          >
            Rename
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
            mappedIcon="delete"
          >
            Delete
          </Button>
        </div>
      )}

      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (!isSubmitting) setCreateDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{createType === "file" ? "Create File" : "Create Folder"}</DialogTitle>
            <DialogDescription>
              {createType === "file"
                ? "Enter a name for the new file."
                : "Enter a name for the new folder."}
            </DialogDescription>
          </DialogHeader>
          <Input
            label="Name"
            value={createName}
            onChange={(event) => setCreateName(event.target.value)}
            placeholder={createType === "file" ? "notes.md" : "new-folder"}
            autoFocus
            disabled={isSubmitting}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setCreateDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                void createEntry();
              }}
              loading={isSubmitting}
              disabled={!createName.trim()}
            >
              {createType === "file" ? "Create File" : "Create Folder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameDialogOpen}
        onOpenChange={(open) => {
          if (!isSubmitting) setRenameDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
            <DialogDescription>
              Choose a new name for <strong>{selectedFile?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <Input
            label="New name"
            value={renameName}
            onChange={(event) => setRenameName(event.target.value)}
            autoFocus
            disabled={isSubmitting}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRenameDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                void renameFile();
              }}
              loading={isSubmitting}
              disabled={!renameName.trim()}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (deleteCloseLockRef.current) return;
          setDeleteDialogOpen(open);
        }}
        title={`Delete ${selectedFile?.type === "dir" ? "Folder" : "File"}`}
        description={
          <>
            Delete <strong>{selectedFile?.name}</strong>?{" "}
            {selectedFile?.type === "dir"
              ? "This will remove everything inside this folder."
              : "This action cannot be undone."}
            {selectedFile?.path ? (
              <>
                <br />
                <span style={{ fontFamily: "var(--font-mono)" }}>{selectedFile.path}</span>
              </>
            ) : null}
          </>
        }
        confirmLabel="Delete"
        confirmVariant="danger"
        confirmLoading={isSubmitting}
        confirmDisabled={!selectedFile}
        onConfirm={() => {
          void deleteFile();
        }}
      />
    </>
  );
});
