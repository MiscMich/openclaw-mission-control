"use client";

import { memo, useMemo } from "react";
import { useShortcuts } from "@/contexts/ShortcutsContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { MappedIcon } from "@/components/ui";

// =============================================================================
// HELPERS
// =============================================================================

function formatKey(key: string): string {
  return key
    .replace("cmd", "⌘")
    .replace("ctrl", "⌃")
    .replace("shift", "⇧")
    .replace("alt", "⌥")
    .replace("enter", "⏎")
    .replace("esc", "⎋")
    .replace("del", "⌫");
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const ShortcutsHelp = memo(function ShortcutsHelp() {
  const { shortcuts, showHelp, closeHelp } = useShortcuts();

  // Group shortcuts by category
  const groupedShortcuts = useMemo(() => {
    const groups = new Map<string, typeof shortcuts>();

    for (const shortcut of shortcuts) {
      const category = shortcut.category;
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(shortcut);
    }

    return groups;
  }, [shortcuts]);

  return (
    <Dialog open={showHelp} onOpenChange={(open) => !open && closeHelp()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MappedIcon name="keyboard" size="sm" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Navigate OpenClaw Mission Control faster with keyboard shortcuts
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {Array.from(groupedShortcuts.entries()).map(([category, categoryShortcuts]) => (
            <div key={category}>
              <h3
                className="text-sm font-medium mb-3"
                style={{ color: "var(--text-secondary)" }}
              >
                {category}
              </h3>
              <div className="space-y-2">
                {categoryShortcuts.map((shortcut) => (
                  <div
                    key={shortcut.key}
                    className="flex items-center justify-between py-2 px-3 rounded-lg"
                    style={{ background: "var(--bg-surface)" }}
                  >
                    <span
                      className="text-sm"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.key.split(" ").map((part, idx) => (
                        <kbd
                          key={idx}
                          className="px-2 py-1 text-xs font-medium rounded"
                          style={{
                            background: "var(--bg-elevated)",
                            color: "var(--text-secondary)",
                            border: "1px solid var(--border-subtle)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {formatKey(part)}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div
          className="pt-4 border-t text-xs text-center"
          style={{
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          Press <kbd className="px-1 py-0.5 rounded bg-[var(--bg-surface)]">⎋</kbd> or{" "}
          <kbd className="px-1 py-0.5 rounded bg-[var(--bg-surface)]">⌘/</kbd> to close
        </div>
      </DialogContent>
    </Dialog>
  );
});
