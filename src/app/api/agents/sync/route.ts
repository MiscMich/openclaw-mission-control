import { NextResponse } from "next/server";
import { convex, api } from "@/lib/convexServer";
import { listSessions } from "@/lib/openclaw/client";
import type { SessionInfo } from "@/lib/openclaw/types";
import { canonicalAgentId } from "@/lib/agents/identity";
import {
  TASK_STATUS_PRIORITY,
  isActiveTaskStatus,
  type TaskStatus,
} from "@/lib/tasks/status";

export const runtime = "nodejs";
type OpenClawSession = Pick<SessionInfo, "key" | "updatedAt" | "ageMs" | "model">;

type TaskShape = {
  id: string;
  status: TaskStatus;
  assigneeId?: string | null;
  assigneeIds?: string[];
  updatedAt?: number;
  createdAt: number;
};

function normalizeTaskAssigneeIds(task: TaskShape): string[] {
  const source =
    task.assigneeIds && task.assigneeIds.length > 0
      ? task.assigneeIds
      : task.assigneeId
        ? [task.assigneeId]
        : [];

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const id of source) {
    if (!id) continue;
    const normalized = canonicalAgentId(id);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }
  return deduped;
}

// Extract agent ID from session key (e.g., "agent:planner:main" -> "planner")
// Returns the canonical agent ID (e.g., "main" -> "coordinator")
function parseAgentFromSessionKey(key: string): string | null {
  // Pattern: agent:{agentId}:{context}
  const match = key.match(/^agent:([^:]+):/);
  return match ? canonicalAgentId(match[1]) : null;
}

// Map session data to agent status
function determineAgentStatus(
  sessions: OpenClawSession[],
  agentId: string
): { status: "working" | "idle" | "offline"; sessionKey?: string; lastActivity?: number } {
  // Find sessions for this agent
  const agentSessions = sessions.filter((s) => {
    const parsed = parseAgentFromSessionKey(s.key);
    return parsed === agentId;
  });

  if (agentSessions.length === 0) {
    return { status: "offline" };
  }

  // Sort by most recent activity
  agentSessions.sort((a, b) => b.updatedAt - a.updatedAt);
  const mostRecent = agentSessions[0];

  // If activity within last 60 seconds, consider "working"
  // If within last 5 minutes, consider "idle"
  // Otherwise "offline"
  const ageSeconds = mostRecent.ageMs / 1000;

  if (ageSeconds < 60) {
    return {
      status: "working",
      sessionKey: mostRecent.key,
      lastActivity: mostRecent.updatedAt,
    };
  } else if (ageSeconds < 300) {
    return {
      status: "idle",
      sessionKey: mostRecent.key,
      lastActivity: mostRecent.updatedAt,
    };
  } else {
    return {
      status: "idle",
      sessionKey: mostRecent.key,
      lastActivity: mostRecent.updatedAt,
    };
  }
}

export async function POST() {
  try {
    // Fetch all agents from Convex to get their IDs
    const agents = await convex.query(api.agents.list, {});
    const sessions = await listSessions();

    const allTasksResult = await convex.query(api.tasks.list, { limit: 500 });
    const allTasks = Array.isArray(allTasksResult?.tasks)
      ? (allTasksResult.tasks as TaskShape[])
      : [];

    const activeTaskByAgent = new Map<string, TaskShape>();
    for (const task of allTasks) {
      if (!isActiveTaskStatus(task.status)) continue;

      const assigneeIds = normalizeTaskAssigneeIds(task);
      if (assigneeIds.length === 0) continue;

      for (const assigneeId of assigneeIds) {
        const current = activeTaskByAgent.get(assigneeId);
        if (!current) {
          activeTaskByAgent.set(assigneeId, task);
          continue;
        }

        const currentPriority = TASK_STATUS_PRIORITY[current.status];
        const incomingPriority = TASK_STATUS_PRIORITY[task.status];
        const currentUpdatedAt = current.updatedAt ?? current.createdAt ?? 0;
        const incomingUpdatedAt = task.updatedAt ?? task.createdAt ?? 0;

        if (
          incomingPriority > currentPriority ||
          (incomingPriority === currentPriority &&
            incomingUpdatedAt > currentUpdatedAt)
        ) {
          activeTaskByAgent.set(assigneeId, task);
        }
      }
    }

    // Update each agent's status and task linkage in parallel
    const agentUpdateResults = await Promise.all(
      agents.map(async (agent) => {
        const activeTask = activeTaskByAgent.get(agent.id);
        const { status, sessionKey } = determineAgentStatus(sessions, agent.id);

        if (status === "working" && activeTask?.status === "assigned") {
          await convex
            .mutation(api.tasks.updateStatus, {
              id: activeTask.id,
              status: "in_progress",
            })
            .catch((e) =>
              console.warn(
                `Failed to promote task ${activeTask.id} to in_progress:`,
                e
              )
            );
        }

        const desiredCurrentTaskId = activeTask?.id ?? "";
        const currentTaskId = typeof agent.currentTaskId === "string" ? agent.currentTaskId : "";

        if (agent.status !== status || currentTaskId !== desiredCurrentTaskId) {
          await convex
            .mutation(api.agents.updateStatus, {
              id: agent.id,
              status,
              currentTaskId: desiredCurrentTaskId,
            })
            .catch((e) =>
              console.warn(`Failed to update agent ${agent.id}:`, e)
            );
        }

        // Always update lastSeen for active agents
        if (status === "working" || status === "idle") {
          await convex.mutation(api.agents.updateLastSeen, { id: agent.id })
            .catch(() => { /* ignore */ });
        }

        if (agent.status !== status || currentTaskId !== desiredCurrentTaskId) {
          return {
            agentId: agent.id,
            status,
            sessionKey,
            currentTaskId: desiredCurrentTaskId || null,
          };
        }

        return null;
      })
    );

    // Filter out null results (agents that didn't need updates)
    const updates = agentUpdateResults.filter((u) => u !== null);

    // Collect unique active agents from sessions (using canonical IDs)
    const activeSessionAgents = new Set<string>();
    for (const session of sessions) {
      const agentId = parseAgentFromSessionKey(session.key);
      if (agentId) {
        activeSessionAgents.add(agentId);
      }
    }

    return NextResponse.json({
      success: true,
      sessionsCount: sessions.length,
      agentsUpdated: updates.length,
      updates,
      activeAgents: Array.from(activeSessionAgents),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}

// GET endpoint to just fetch current session/agent mapping
export async function GET() {
  try {
    const sessions = await listSessions();

    // Map sessions to agents (using canonical IDs)
    const agentSessions: Record<
      string,
      { sessionKey: string; updatedAt: number; ageMs: number; model?: string }[]
    > = {};

    for (const session of sessions) {
      const agentId = parseAgentFromSessionKey(session.key);
      if (agentId) {
        if (!agentSessions[agentId]) {
          agentSessions[agentId] = [];
        }
        agentSessions[agentId].push({
          sessionKey: session.key,
          updatedAt: session.updatedAt,
          ageMs: session.ageMs,
          model: session.model,
        });
      }
    }

    return NextResponse.json({
      success: true,
      sessionsCount: sessions.length,
      agentSessions,
      rawSessions: sessions,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}
