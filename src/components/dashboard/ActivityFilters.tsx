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

interface ActivityFiltersProps {
  search: string;
  onSearchChange: (search: string) => void;
  type?: string;
  onTypeChange: (type: string | undefined) => void;
  agentId?: string;
  onAgentChange: (agentId: string | undefined) => void;
  hideNoise: boolean;
  onHideNoiseChange: (hide: boolean) => void;
  onClearAll: () => void;
}

const EVENT_TYPES = [
  // Tasks
  { value: "task_created", label: "Task Created" },
  { value: "task_updated", label: "Task Updated" },
  { value: "task_status_changed", label: "Task Status Changed" },
  { value: "task_completed", label: "Task Completed" },
  { value: "task_progress", label: "Task Progress" },

  // Collaboration / docs
  { value: "comment_added", label: "Comment Added" },
  { value: "document_created", label: "Document Created" },
  { value: "agent_message", label: "Agent Message" },
  { value: "message_sent", label: "Outbound Message (Tool)" },

  // Code / ops
  { value: "file_modified", label: "File Modified" },
  { value: "code_committed", label: "Code Committed" },
  { value: "deployment", label: "Deployment" },

  // Web tools
  { value: "web_search", label: "Web Search" },
  { value: "web_fetch", label: "Web Fetch" },

  // Agents
  { value: "agent_session_start", label: "Agent Session Start" },
  { value: "agent_spawned", label: "Agent Spawned" },
  { value: "agent_discovered", label: "Agent Discovered" },
  { value: "agent_status_changed", label: "Agent Status Changed" },
  { value: "agent_online", label: "Agent Online" },
  { value: "agent_offline", label: "Agent Offline" },

  // Legacy types kept for backward compatibility
  { value: "task_assigned", label: "Task Assigned (legacy)" },
  { value: "task_claimed", label: "Task Claimed (legacy)" },
  { value: "agent_started", label: "Agent Started (legacy)" },
  { value: "agent_finished", label: "Agent Finished (legacy)" },
];

export const ActivityFilters = memo(function ActivityFilters({
  search,
  onSearchChange,
  type,
  onTypeChange,
  agentId,
  onAgentChange,
  hideNoise,
  onHideNoiseChange,
  onClearAll,
}: ActivityFiltersProps) {
  const agentsQuery = useQuery(api.agents.list, {});
  const agents = useMemo(() => agentsQuery ?? [], [agentsQuery]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (type) count++;
    if (agentId) count++;
    if (search && search.length >= 2) count++;
    return count;
  }, [type, agentId, search]);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === agentId),
    [agents, agentId]
  );

  const selectedType = useMemo(
    () => EVENT_TYPES.find((t) => t.value === type),
    [type]
  );

  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
      {/* Search */}
      <SearchInput
        value={search}
        onChange={onSearchChange}
        placeholder="Search activity..."
        className="w-full sm:w-64"
      />

      {/* Event Type Filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <MappedIcon name="filter" size="xs" />
            Type
            {type && (
              <Badge variant="primary" size="sm">
                {selectedType?.label}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Filter by event type</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={!type}
            onCheckedChange={() => onTypeChange(undefined)}
          >
            All Types
          </DropdownMenuCheckboxItem>
          {EVENT_TYPES.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={type === option.value}
              onCheckedChange={() =>
                onTypeChange(type === option.value ? undefined : option.value)
              }
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Agent Filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <MappedIcon name="robot" size="xs" />
            Agent
            {agentId && (
              <Badge variant="primary" size="sm">
                {selectedAgent?.name}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Filter by agent</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={!agentId}
            onCheckedChange={() => onAgentChange(undefined)}
          >
            All Agents
          </DropdownMenuCheckboxItem>
          {agents.map((agent) => (
            <DropdownMenuCheckboxItem
              key={agent.id}
              checked={agentId === agent.id}
              onCheckedChange={() =>
                onAgentChange(agentId === agent.id ? undefined : agent.id)
              }
            >
              {agent.name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant={hideNoise ? "secondary" : "outline"}
        size="sm"
        onClick={() => onHideNoiseChange(!hideNoise)}
        className="gap-2"
        title={hideNoise ? "Noise hidden" : "Show all events"}
      >
        <MappedIcon name={hideNoise ? "success" : "activity"} size="xs" />
        {hideNoise ? "Signal" : "All"}
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
