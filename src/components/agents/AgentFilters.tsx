"use client";

import { memo, useMemo } from "react";
import { Button, Badge, MappedIcon } from "@/components/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui";

interface AgentFiltersProps {
  status?: string;
  onStatusChange: (status: string | undefined) => void;
  sortBy: "name" | "cost" | "tokens" | "lastSeen";
  onSortChange: (sortBy: "name" | "cost" | "tokens" | "lastSeen") => void;
  sortOrder: "asc" | "desc";
  onSortOrderChange: (sortOrder: "asc" | "desc") => void;
  onClearAll: () => void;
}

const STATUS_OPTIONS = [
  { value: "idle", label: "Idle", color: "var(--text-dim)" },
  { value: "working", label: "Working", color: "var(--accent-primary)" },
  { value: "offline", label: "Offline", color: "var(--text-muted)" },
  { value: "error", label: "Error", color: "var(--accent-error)" },
];

const SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "cost", label: "Cost" },
  { value: "tokens", label: "Tokens" },
  { value: "lastSeen", label: "Last Activity" },
];

type SortBy = AgentFiltersProps["sortBy"];

function isSortBy(value: string): value is SortBy {
  return value === "name" || value === "cost" || value === "tokens" || value === "lastSeen";
}

export const AgentFilters = memo(function AgentFilters({
  status,
  onStatusChange,
  sortBy,
  onSortChange,
  sortOrder,
  onSortOrderChange,
  onClearAll,
}: AgentFiltersProps) {
  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (status) count++;
    if (sortBy !== "name") count++;
    if (sortOrder !== "asc") count++;
    return count;
  }, [status, sortBy, sortOrder]);

  const selectedStatus = useMemo(
    () => STATUS_OPTIONS.find((s) => s.value === status),
    [status]
  );

  const selectedSort = useMemo(
    () => SORT_OPTIONS.find((s) => s.value === sortBy),
    [sortBy]
  );

  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
      {/* Status Filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <MappedIcon name="filter" size="xs" />
            Status
            {status && (
              <Badge variant="primary" size="sm">
                {selectedStatus?.label}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={!status}
            onCheckedChange={() => onStatusChange(undefined)}
          >
            All Statuses
          </DropdownMenuCheckboxItem>
          {STATUS_OPTIONS.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={status === option.value}
              onCheckedChange={() =>
                onStatusChange(status === option.value ? undefined : option.value)
              }
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: option.color }}
                />
                {option.label}
              </div>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sort By */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <MappedIcon name="sort" size="xs" />
            Sort by
            {sortBy !== "name" && (
              <Badge variant="primary" size="sm">
                {selectedSort?.label}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>Sort by</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={sortBy}
            onValueChange={(value) => {
              if (isSortBy(value)) onSortChange(value);
            }}
          >
            {SORT_OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sort Order */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onSortOrderChange(sortOrder === "asc" ? "desc" : "asc")}
        className="gap-2"
      >
        <MappedIcon
          name={sortOrder === "asc" ? "arrowUp" : "arrowDown"}
          size="xs"
        />
        {sortOrder === "asc" ? "Ascending" : "Descending"}
      </Button>

      {/* Clear All Filters */}
      {activeFilterCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAll}
          className="gap-2 ml-auto"
        >
          <MappedIcon name="close" size="xs" />
          Clear All
          <Badge variant="secondary" size="sm">
            {activeFilterCount}
          </Badge>
        </Button>
      )}
    </div>
  );
});
