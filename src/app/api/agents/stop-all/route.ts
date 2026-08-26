import { NextResponse } from "next/server";
import { killAllSessions, OpenClawGatewayError } from "@/lib/openclaw/client";
import { convex, api } from "@/lib/convexServer";
import { withAuth } from "@/lib/apiAuth";

export async function GET() {
  return NextResponse.json({ 
    message: "Use POST to stop all agents" 
  }, { status: 405 });
}

async function handler() {
  try {
    // Get all agents first
    const agents = await convex.query(api.agents.list, {});
    const workingAgents = agents.filter(a => a.status === "working");

    // Parallelize all agent status updates (async-parallel optimization)
    await Promise.all([
      // Update all working agents to idle in parallel
      ...workingAgents.map(agent =>
        convex.mutation(api.agents.updateStatus, {
          id: agent.id,
          status: "idle",
          currentTaskId: undefined,
        }).catch((e) => console.warn(`Failed to update agent ${agent.id} status:`, e))
      ),

      // Log the stop-all action
      convex.mutation(api.activity.log, {
        type: "emergency_stop",
        message: "Emergency stop: All agents stopped",
      }).catch((e) => console.warn("Failed to log activity:", e)),

      // Try to restart gateway to clear any running sessions
      killAllSessions().catch((e) => console.warn("Gateway restart attempted:", e)),
    ]);

    return NextResponse.json({
      success: true,
      message: "All agents stopped",
      agentsStopped: workingAgents.length,
    });

  } catch (error) {
    if (error instanceof OpenClawGatewayError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status ?? 502 }
      );
    }
    
    return NextResponse.json({ error: "Failed to stop all agents" }, { status: 502 });
  }
}

export const POST = withAuth(handler);
