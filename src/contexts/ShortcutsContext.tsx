"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

// =============================================================================
// TYPES
// =============================================================================

export type ShortcutAction =
  | "command-palette"
  | "help"
  | "dashboard"
  | "tasks"
  | "agents"
  | "files"
  | "settings"
  | "create-task"
  | "edit-task"
  | "delete-task"
  | "focus-search"
  | "close-modal"
  | "navigate-up"
  | "navigate-down"
  | "select-item";

export interface ShortcutDefinition {
  key: string;
  description: string;
  category: "Global" | "Navigation" | "Tasks" | "Search";
  action: ShortcutAction;
}

interface ShortcutsContextValue {
  shortcuts: ShortcutDefinition[];
  showHelp: boolean;
  openHelp: () => void;
  closeHelp: () => void;
  registerAction: (action: ShortcutAction, handler: () => void) => void;
  unregisterAction: (action: ShortcutAction) => void;
  triggerAction: (action: ShortcutAction) => void;
}

// =============================================================================
// SHORTCUTS DEFINITIONS
// =============================================================================

export const SHORTCUTS: ShortcutDefinition[] = [
  // Global
  { key: "cmd+k", description: "Open command palette", category: "Global", action: "command-palette" },
  { key: "cmd+/", description: "Show keyboard shortcuts", category: "Global", action: "help" },
  { key: "esc", description: "Close modals/panels", category: "Global", action: "close-modal" },

  // Navigation
  { key: "g d", description: "Go to Dashboard", category: "Navigation", action: "dashboard" },
  { key: "g t", description: "Go to Tasks", category: "Navigation", action: "tasks" },
  { key: "g a", description: "Go to Agents", category: "Navigation", action: "agents" },
  { key: "g f", description: "Go to Files", category: "Navigation", action: "files" },
  { key: "g s", description: "Go to Settings", category: "Navigation", action: "settings" },

  // Tasks
  { key: "c", description: "Create new task", category: "Tasks", action: "create-task" },
  { key: "e", description: "Edit selected task", category: "Tasks", action: "edit-task" },
  { key: "del", description: "Delete selected task", category: "Tasks", action: "delete-task" },
  { key: "j", description: "Navigate down", category: "Tasks", action: "navigate-down" },
  { key: "k", description: "Navigate up", category: "Tasks", action: "navigate-up" },
  { key: "enter", description: "Open selected task", category: "Tasks", action: "select-item" },

  // Search
  { key: "/", description: "Focus search", category: "Search", action: "focus-search" },
];

// =============================================================================
// CONTEXT
// =============================================================================

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null);

// =============================================================================
// PROVIDER
// =============================================================================

export function ShortcutsProvider({ children }: { children: ReactNode }) {
  const [showHelp, setShowHelp] = useState(false);
  const [actionHandlers] = useState<Map<ShortcutAction, () => void>>(new Map());

  const openHelp = useCallback(() => setShowHelp(true), []);
  const closeHelp = useCallback(() => setShowHelp(false), []);

  const registerAction = useCallback((action: ShortcutAction, handler: () => void) => {
    actionHandlers.set(action, handler);
  }, [actionHandlers]);

  const unregisterAction = useCallback((action: ShortcutAction) => {
    actionHandlers.delete(action);
  }, [actionHandlers]);

  const triggerAction = useCallback((action: ShortcutAction) => {
    const handler = actionHandlers.get(action);
    if (handler) {
      handler();
    }
  }, [actionHandlers]);

  return (
    <ShortcutsContext.Provider
      value={{
        shortcuts: SHORTCUTS,
        showHelp,
        openHelp,
        closeHelp,
        registerAction,
        unregisterAction,
        triggerAction,
      }}
    >
      {children}
    </ShortcutsContext.Provider>
  );
}

// =============================================================================
// HOOK
// =============================================================================

export function useShortcuts() {
  const context = useContext(ShortcutsContext);
  if (!context) {
    throw new Error("useShortcuts must be used within ShortcutsProvider");
  }
  return context;
}
