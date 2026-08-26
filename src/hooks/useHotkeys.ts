import { useHotkeys as useHotkeysLib, type Options } from "react-hotkeys-hook";
import { useShortcuts, type ShortcutAction } from "@/contexts/ShortcutsContext";
import { useEffect } from "react";

/**
 * Custom hook wrapper for react-hotkeys-hook
 * Integrates with ShortcutsContext for centralized shortcut management
 */

export function useHotkeys(
  keys: string,
  callback: (event: KeyboardEvent) => void,
  options?: Options
) {
  return useHotkeysLib(keys, callback, options);
}

/**
 * Hook to register an action handler with the shortcuts context
 * Automatically unregisters on unmount
 */
export function useShortcutAction(action: ShortcutAction, handler: () => void) {
  const { registerAction, unregisterAction } = useShortcuts();

  useEffect(() => {
    registerAction(action, handler);
    return () => unregisterAction(action);
  }, [action, handler, registerAction, unregisterAction]);
}
