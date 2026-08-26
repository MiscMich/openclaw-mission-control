"use client";

import { memo, useCallback } from "react";
import { Select, FormGroup, MappedIcon } from "@/components/ui";
import type { SelectOption } from "@/components/ui";

interface ModelSelectorProps {
  primary: string;
  fallbacks: string[];
  onPrimaryChange: (value: string) => void;
  onFallbacksChange: (value: string[]) => void;
}

const AVAILABLE_MODELS: SelectOption[] = [
  { value: "claude-opus-4-6", label: "Claude Opus 4.6 (Most Capable)" },
  { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5 (Balanced)" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (Fast)" },
  { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet (Legacy)" },
  { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku (Legacy)" },
];

export const ModelSelector = memo(function ModelSelector({
  primary,
  fallbacks,
  onPrimaryChange,
  onFallbacksChange,
}: ModelSelectorProps) {
  const handleRemoveFallback = useCallback((modelToRemove: string) => {
    onFallbacksChange(fallbacks.filter((m) => m !== modelToRemove));
  }, [fallbacks, onFallbacksChange]);

  const handleAddFallback = useCallback((model: string) => {
    if (!fallbacks.includes(model) && model !== primary) {
      onFallbacksChange([...fallbacks, model]);
    }
  }, [fallbacks, primary, onFallbacksChange]);

  const availableFallbacks = AVAILABLE_MODELS.filter(
    (m) => m.value !== primary && !fallbacks.includes(m.value)
  );

  return (
    <div className="space-y-6">
      <div>
        <h3
          className="text-sm font-semibold mb-4 uppercase tracking-wide"
          style={{ color: "var(--text-secondary)" }}
        >
          Model Configuration
        </h3>

        <FormGroup>
          <Select
            label="Primary Model"
            value={primary}
            onChange={(e) => onPrimaryChange(e.target.value)}
            options={AVAILABLE_MODELS}
            hint="Default model for this agent"
          />
        </FormGroup>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <label
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            Fallback Models
          </label>
          {availableFallbacks.length > 0 && (
            <Select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  handleAddFallback(e.target.value);
                  e.target.value = "";
                }
              }}
              options={[
                { value: "", label: "+ Add Fallback" },
                ...availableFallbacks,
              ]}
              size="sm"
            />
          )}
        </div>

        {fallbacks.length === 0 ? (
          <div
            className="p-4 rounded-lg border border-dashed text-center"
            style={{
              borderColor: "var(--border-subtle)",
              color: "var(--text-dim)"
            }}
          >
            <p className="text-sm">No fallback models configured</p>
            <p className="text-xs mt-1">Add models to use if primary fails</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {fallbacks.map((model, index) => {
              const modelInfo = AVAILABLE_MODELS.find((m) => m.value === model);
              return (
                <div
                  key={model}
                  className="group flex items-center gap-2 px-3 py-2 rounded-lg border transition-all"
                  style={{
                    background: "var(--bg-elevated)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <span
                    className="text-xs font-mono font-semibold"
                    style={{ color: "var(--text-dim)" }}
                  >
                    {index + 1}
                  </span>
                  <span
                    className="text-sm"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {modelInfo?.label || model}
                  </span>
                  <button
                    onClick={() => handleRemoveFallback(model)}
                    className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "var(--text-dim)" }}
                    aria-label="Remove fallback"
                  >
                    <MappedIcon name="close" size="xs" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p
          className="text-xs mt-3"
          style={{ color: "var(--text-dim)" }}
        >
          Fallbacks are tried in order if the primary model is unavailable
        </p>
      </div>
    </div>
  );
});
