"use client";

import { memo, useState, useEffect, useCallback, useRef } from "react";
import { MappedIcon } from "@/components/ui";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounce?: number;
  className?: string;
  autoFocus?: boolean;
}

export const SearchInput = memo(function SearchInput({
  value: controlledValue,
  onChange,
  placeholder = "Search...",
  debounce = 300,
  className,
  autoFocus = false,
}: SearchInputProps) {
  const [localValue, setLocalValue] = useState(controlledValue ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isControlled = controlledValue !== undefined;
  const displayValue = isControlled ? (controlledValue ?? "") : localValue;

  const queueChange = useCallback(
    (nextValue: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        onChange(nextValue);
      }, debounce);
    },
    [debounce, onChange]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleInputChange = useCallback(
    (nextValue: string) => {
      if (!isControlled) {
        setLocalValue(nextValue);
      }
      queueChange(nextValue);
    },
    [isControlled, queueChange]
  );

  const handleClear = useCallback(() => {
    if (!isControlled) {
      setLocalValue("");
    }
    queueChange("");
  }, [isControlled, queueChange]);

  return (
    <div className={cn("relative flex items-center", className)}>
      <MappedIcon
        name="search"
        size="sm"
        className="absolute left-3 pointer-events-none"
        style={{ color: "var(--text-muted)" }}
      />
      <input
        type="text"
        value={displayValue}
        onChange={(e) => handleInputChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={cn(
          "w-full h-9 pl-9 pr-9 rounded-lg border transition-colors",
          "text-sm placeholder:text-sm",
          "focus:outline-none focus:ring-2 focus:ring-offset-0"
        )}
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-primary)",
        }}
      />
      {displayValue && (
        <button
          onClick={handleClear}
          className="absolute right-2 p-1 rounded hover:bg-white/5 transition-colors"
          aria-label="Clear search"
        >
          <MappedIcon
            name="close"
            size="xs"
            style={{ color: "var(--text-muted)" }}
          />
        </button>
      )}
    </div>
  );
});
