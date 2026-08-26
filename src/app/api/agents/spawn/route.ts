import { NextRequest, NextResponse } from "next/server";
import { OpenClawGatewayError, spawnSession } from "@/lib/openclaw/client";
import { convex, api } from "@/lib/convexServer";
import { withAuth } from "@/lib/apiAuth";
import { triggerSessionsStreamRefresh } from "@/lib/realtime/sessionsStream";
import { type TaskStatus } from "@/lib/tasks/status";
import { requireLoopbackHttpUrl } from "@/lib/security/url";
import { readBoundedJsonObject } from "@/lib/security/request";

function resolveMissionControlUrl(request: NextRequest): string {
  const configured = process.env.MISSION_CONTROL_URL?.trim();
  return requireLoopbackHttpUrl(configured || new URL(request.url).origin);
}

function appendTaskStatusInstructions(
  prompt: string,
  missionControlUrl: string,
  agentId: string,
  taskId: string
): string {
  const statusEndpoint = `${missionControlUrl}/api/tasks/${taskId}/status`;
  const heartbeatEndpoint = `${missionControlUrl}/api/agents/${agentId}/heartbeat`;
  const authHint = "Include the configured x-api-key header.";

  return `${prompt.trim()}

OpenClaw Mission Control API updates (required):
- Progress: POST ${statusEndpoint}
  body: {"status":"in_progress","agentId":"${agentId}","output":"progress note"}
- Done: POST ${statusEndpoint}
  body: {"status":"done","agentId":"${agentId}","output":"completion summary"}
- Needs approval: POST ${statusEndpoint}
  body: {"status":"review","agentId":"${agentId}","output":"ready for Operator review"}
- Blocked: POST ${statusEndpoint}
  body: {"status":"blocked","agentId":"${agentId}","output":"blocker details"}
- Optional heartbeat: POST ${heartbeatEndpoint}
  body: {"status":"working","currentTaskId":"${taskId}"}
- Note: If a task requires approval, posting done may be converted to review automatically.
- ${authHint}`;
}

async function handler(request: NextRequest) {
  try {
    const body = await readBoundedJsonObject(request, 64 * 1024);

    if (typeof body.agentId !== "string" || !body.agentId.trim()) {
      return NextResponse.json({ error: "agentId required" }, { status: 400 });
    }
    if (typeof body.taskId !== "string" || !body.taskId.trim()) {
      return NextResponse.json({ error: "taskId required" }, { status: 400 });
    }
    if (typeof body.prompt !== "string" || !body.prompt.trim()) {
      return NextResponse.json({ error: "prompt required" }, { status: 400 });
    }
    if (body.agentId.length > 128 || body.taskId.length > 128 || body.prompt.length > 50_000) {
      return NextResponse.json({ error: "Request fields exceed allowed limits" }, { status: 400 });
    }

    const missionControlUrl = resolveMissionControlUrl(request);
    const taskPrompt = appendTaskStatusInstructions(
      body.prompt,
      missionControlUrl,
      body.agentId,
      body.taskId
    );

    const result = await spawnSession(body.agentId, taskPrompt, body.taskId);
    await triggerSessionsStreamRefresh("spawn-session");

    // Required state updates: these must succeed or the UI will diverge from reality.
    await convex.mutation(api.agents.updateStatus, {
      id: body.agentId,
      status: "working",
      currentTaskId: body.taskId,
    });
    const currentTask = await convex.query(api.tasks.getById, { id: body.taskId });
    const inProgressEligibleStatuses = new Set<TaskStatus>([
      "open",
      "inbox",
      "assigned",
      "in_progress",
    ]);
    if (
      currentTask &&
      inProgressEligibleStatuses.has(currentTask.status as TaskStatus)
    ) {
      await convex.mutation(api.tasks.updateStatus, {
        id: body.taskId,
        status: "in_progress",
      });
    }
    await convex.mutation(api.tasks.setSessionKey, {
      id: body.taskId,
      sessionKey: result.sessionKey,
    });

    const warnings: string[] = [];
    try {
      await convex.mutation(api.activity.log, {
        type: "agent_spawned",
        message: `Agent ${body.agentId} spawned for task ${body.taskId}`,
        agentId: body.agentId,
        taskId: body.taskId,
      });
    } catch (error) {
      warnings.push(
        error instanceof Error ? error.message : "Failed to log spawn activity"
      );
    }

    return NextResponse.json({ 
      sessionId: result.sessionId, 
      sessionKey: result.sessionKey,
      status: result.status,
      success: true,
      warnings,
    });
  } catch (error) {
    if (error instanceof OpenClawGatewayError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status ?? 502 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to spawn session" },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handler);
