"use client";

import { memo, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useShortcuts } from "@/contexts/ShortcutsContext";
import type { ShortcutAction } from "@/contexts/ShortcutsContext";
import { useHotkeys } from "@/hooks/useHotkeys";
import { ShortcutsHelp } from "@/components/ui";

/**
 * Global keyboard shortcuts handler
 * Must be rendered inside ShortcutsProvider
 */
export const GlobalShortcuts = memo(function GlobalShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const { openHelp, closeHelp, registerAction, unregisterAction } = useShortcuts();

  // Register global actions
  useEffect(() => {
    const actions: Partial<Record<ShortcutAction, () => void>> = {
      help: () => openHelp(),
      dashboard: () => router.push("/dashboard"),
      tasks: () => router.push("/tasks"),
      agents: () => router.push("/agents"),
      files: () => router.push("/files"),
      settings: () => router.push("/settings"),
      "close-modal": () => {
        // Close any open modals
        closeHelp();
      },
    };

    for (const [action, handler] of Object.entries(actions)) {
      if (handler) registerAction(action as ShortcutAction, handler);
    }

    return () => {
      for (const action of Object.keys(actions)) {
        unregisterAction(action as ShortcutAction);
      }
    };
  }, [router, pathname, openHelp, closeHelp, registerAction, unregisterAction]);

  // Global shortcuts
  useHotkeys("mod+/", (e) => {
    e.preventDefault();
    openHelp();
  });

  // Close on escape (only if help is open)
  useHotkeys(
    "escape",
    (e) => {
      e.preventDefault();
      closeHelp();
    },
    { enabled: true }
  );

  // Navigation shortcuts (vim-style with G prefix)
  useHotkeys("g d", () => router.push("/dashboard"));
  useHotkeys("g t", () => router.push("/tasks"));
  useHotkeys("g a", () => router.push("/agents"));
  useHotkeys("g f", () => router.push("/files"));
  useHotkeys("g s", () => router.push("/settings"));

  return <ShortcutsHelp />;
});
