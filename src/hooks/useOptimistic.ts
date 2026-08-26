import { useState, useCallback } from "react";
import { toast } from "sonner";

/**
 * Hook for optimistic UI updates
 * Provides instant feedback before server confirms
 */

interface OptimisticState<T> {
  data: T | null;
  isPending: boolean;
  error: Error | null;
}

interface UseOptimisticOptions<TArgs, TResult> {
  mutation: (args: TArgs) => Promise<TResult>;
  onSuccess?: (result: TResult) => void;
  onError?: (error: Error) => void;
  successMessage?: string;
  errorMessage?: string;
}

export function useOptimistic<TArgs, TResult = void>({
  mutation,
  onSuccess,
  onError,
  successMessage,
  errorMessage,
}: UseOptimisticOptions<TArgs, TResult>) {
  const [state, setState] = useState<OptimisticState<TResult>>({
    data: null,
    isPending: false,
    error: null,
  });

  const execute = useCallback(
    async (args: TArgs, optimisticData?: TResult) => {
      setState({ data: optimisticData ?? null, isPending: true, error: null });

      try {
        const result = await mutation(args);
        setState({ data: result, isPending: false, error: null });

        if (successMessage) {
          toast.success(successMessage);
        }

        onSuccess?.(result);
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        setState({ data: null, isPending: false, error: err });

        toast.error(errorMessage || "Operation failed", {
          description: err.message,
        });

        onError?.(err);
        throw err;
      }
    },
    [mutation, onSuccess, onError, successMessage, errorMessage]
  );

  const reset = useCallback(() => {
    setState({ data: null, isPending: false, error: null });
  }, []);

  return {
    execute,
    reset,
    ...state,
  };
}

/**
 * Simplified hook for list-based optimistic updates
 * Handles common patterns like adding/removing items from lists
 */
interface UseOptimisticListOptions<T, TArgs> {
  mutation: (args: TArgs) => Promise<T>;
  onOptimisticUpdate?: (args: TArgs) => T;
  successMessage?: string;
  errorMessage?: string;
}

export function useOptimisticList<T, TArgs = void>({
  mutation,
  onOptimisticUpdate,
  successMessage,
  errorMessage,
}: UseOptimisticListOptions<T, TArgs>) {
  const [optimisticItems, setOptimisticItems] = useState<Map<string, T>>(new Map());

  const execute = useCallback(
    async (args: TArgs, tempId?: string) => {
      const id = tempId || `temp-${Date.now()}-${Math.random()}`;

      // Apply optimistic update
      if (onOptimisticUpdate) {
        const optimisticItem = onOptimisticUpdate(args);
        setOptimisticItems((prev) => new Map(prev).set(id, optimisticItem));
      }

      try {
        const result = await mutation(args);

        // Remove optimistic item
        setOptimisticItems((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });

        if (successMessage) {
          toast.success(successMessage);
        }

        return result;
      } catch (error) {
        // Remove failed optimistic item
        setOptimisticItems((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });

        const err = error instanceof Error ? error : new Error(String(error));
        toast.error(errorMessage || "Operation failed", {
          description: err.message,
        });

        throw err;
      }
    },
    [mutation, onOptimisticUpdate, successMessage, errorMessage]
  );

  return {
    execute,
    optimisticItems: Array.from(optimisticItems.values()),
    hasOptimisticItems: optimisticItems.size > 0,
  };
}
