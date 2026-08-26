"use client";

import { memo, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convexApi";
import { Button, Badge, MappedIcon } from "@/components/ui";
import { SearchInput } from "@/components/ui/SearchInput";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui";

interface TaskFiltersProps {
  search: string;
  onSearchChange: (search: string) => void;
  status?: string;
  onStatusChange: (status: string | undefined) => void;
  priority?: string;
  onPriorityChange: (priority: string | undefined) => void;
  assigneeId?: string;
  onAssigneeChange: (assigneeId: string | undefined) => void;
  onClearAll: () => void;
}

const STATUS_OPTIONS = [
  { value: "inbox", label: "Inbox" },
  { value: "open", label: "Open" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "review", label: "Review" },
  { value: "completed", label: "Completed" },
  { value: "done", label: "Done" },
  { value: "blocked", label: "Blocked" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

const PRIORITY_OPTIONS = [
  { value: "urgent", label: "Urgent", color: "var(--accent-error)" },
  { value: "high", label: "High", color: "var(--accent-warning)" },
  { value: "normal", label: "Normal", color: "var(--accent-primary)" },
  { value: "low", label: "Low", color: "var(--text-muted)" },
];

export const TaskFilters = memo(function TaskFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  priority,
  onPriorityChange,
  assigneeId,
  onAssigneeChange,
  onClearAll,
}: TaskFiltersProps) {
  const agents = useQuery(api.agents.list, {});

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (status) count++;
    if (priority) count++;
    if (assigneeId) count++;
    if (search && search.length >= 2) count++;
    return count;
  }, [status, priority, assigneeId, search]);

  const selectedAgent = useMemo(
    () => agents?.find((a) => a.id === assigneeId),
    [agents, assigneeId]
  );

  const selectedStatus = useMemo(
    () => STATUS_OPTIONS.find((s) => s.value === status),
    [status]
  );

  const selectedPriority = useMemo(
    () => PRIORITY_OPTIONS.find((p) => p.value === priority),
    [priority]
  );

  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
      {/* Search */}
      <SearchInput
        value={search}
        onChange={onSearchChange}
        placeholder="Search tasks..."
        className="w-full sm:w-64"
      />

      {/* Status Filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <MappedIcon name="filter" size="xs" />
            Status
            {status && (
              <Badge variant="primary" size="sm">
                {selectedStatus?.label}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
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
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Priority Filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <MappedIcon name="filter" size="xs" />
            Priority
            {priority && (
              <Badge variant="primary" size="sm">
                {selectedPriority?.label}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>Filter by priority</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={!priority}
            onCheckedChange={() => onPriorityChange(undefined)}
          >
            All Priorities
          </DropdownMenuCheckboxItem>
          {PRIORITY_OPTIONS.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={priority === option.value}
              onCheckedChange={() =>
                onPriorityChange(
                  priority === option.value ? undefined : option.value
                )
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

      {/* Assignee Filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <MappedIcon name="robot" size="xs" />
            Assignee
            {assigneeId && (
              <Badge variant="primary" size="sm">
                {selectedAgent?.name}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Filter by assignee</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={!assigneeId}
            onCheckedChange={() => onAssigneeChange(undefined)}
          >
            All Assignees
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={assigneeId === "unassigned"}
            onCheckedChange={() =>
              onAssigneeChange(assigneeId === "unassigned" ? undefined : "unassigned")
            }
          >
            Unassigned
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          {(agents ?? []).map((agent) => (
            <DropdownMenuCheckboxItem
              key={agent.id}
              checked={assigneeId === agent.id}
              onCheckedChange={() =>
                onAssigneeChange(assigneeId === agent.id ? undefined : agent.id)
              }
            >
              {agent.name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

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
