#!/usr/bin/env node
/**
 * Heartbeat Bridge - Connects OpenClaw Mission Control to OpenClaw
 * 
 * This worker:
 * 1. Polls OpenClaw Mission Control for each agent's assigned tasks
 * 2. When a task is assigned, spawns an OpenClaw session for that agent
 * 3. Tracks the session key on the task
 * 4. Updates task status as the agent works
 */

import { spawn } from "node:child_process";
import { join } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { requireAbsoluteConfiguredPath } from "./configured-paths.mjs";

// Configuration
const MISSION_CONTROL_URL = process.env.MISSION_CONTROL_URL ?? "http://127.0.0.1:3000";
const OPENCLAW_CLI = process.env.OPENCLAW_CLI ?? "openclaw";
const DEFAULT_POLL_INTERVAL_MS = 30_000; // 30s default for near-real-time queue processing
const POLL_INTERVAL = Math.max(
  5_000,
  Number(process.env.POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS)
);
const DEFAULT_AGENT_REFRESH_MS = 60_000;
const AGENT_REFRESH_MS = Math.max(
  10_000,
  Number(process.env.AGENT_REFRESH_MS ?? DEFAULT_AGENT_REFRESH_MS)
);
const ACTIVE_SESSION_WINDOW_MS = Number(
  process.env.ACTIVE_SESSION_WINDOW_MS ?? 60_000
);
const AGENT_API_KEY = process.env.AGENT_API_KEY ?? "";

const AGENTS_DIR = requireAbsoluteConfiguredPath("OPENCLAW_AGENTS_DIR");
const OPENCLAW_AGENT_ALIASES = {
  coordinator: "main",
};
const MISSION_CONTROL_AGENT_ALIASES = {
  main: "coordinator",
};
const FALLBACK_AGENT_IDS = ["coordinator"];

let trackedAgentIds = [...FALLBACK_AGENT_IDS];
let lastAgentRefreshAt = 0;

function resolveOpenClawAgentId(agentId) {
  return OPENCLAW_AGENT_ALIASES[agentId] ?? agentId;
}

function normalizeMissionControlAgentId(agentId) {
  return MISSION_CONTROL_AGENT_ALIASES[agentId] ?? agentId;
}

// Track sessions we've spawned to avoid duplicates
const spawnedSessions = new Map(); // taskId -> sessionKey

function requestHeaders() {
  return AGENT_API_KEY
    ? { "Content-Type": "application/json", "x-api-key": AGENT_API_KEY }
    : { "Content-Type": "application/json" };
}

async function fetchTrackedAgentIds() {
  try {
    const res = await fetch(`${MISSION_CONTROL_URL}/api/agents`, {
      headers: AGENT_API_KEY ? { "x-api-key": AGENT_API_KEY } : undefined,
    });
    if (!res.ok) {
      return null;
    }

    const payload = await res.json();
    const agents = Array.isArray(payload?.agents)
      ? payload.agents
      : Array.isArray(payload)
        ? payload
        : [];
    const discovered = agents
      .map((agent) => {
        if (!agent || typeof agent !== "object") return null;
        const id = agent.id;
        return typeof id === "string" && id.trim()
          ? normalizeMissionControlAgentId(id.trim())
          : null;
      })
      .filter(Boolean);

    if (discovered.length === 0) {
      return null;
    }

    return [...new Set(discovered)];
  } catch {
    return null;
  }
}

async function refreshTrackedAgentIds(force = false) {
  const now = Date.now();
  if (!force && now - lastAgentRefreshAt < AGENT_REFRESH_MS) {
    return trackedAgentIds;
  }
  lastAgentRefreshAt = now;

  const discoveredIds = await fetchTrackedAgentIds();
  if (!discoveredIds || discoveredIds.length === 0) {
    if (trackedAgentIds.length === 0) {
      trackedAgentIds = [...FALLBACK_AGENT_IDS];
    }
    return trackedAgentIds;
  }

  const normalized = [...new Set(discoveredIds)];
  if (
    normalized.length !== trackedAgentIds.length ||
    normalized.some((id, idx) => trackedAgentIds[idx] !== id)
  ) {
    trackedAgentIds = normalized;
    console.log(
      `[bridge] Agent roster updated (${trackedAgentIds.length}): ${trackedAgentIds
        .map((id) => id.toUpperCase())
        .join(", ")}`
    );
  }

  return trackedAgentIds;
}

/**
 * Call OpenClaw Mission Control heartbeat API for an agent
 */
async function agentHeartbeat(agentId, status = "idle", currentTaskId = null) {
  const url = `${MISSION_CONTROL_URL}/api/agents/${agentId}/heartbeat`;
  
  try {
    const body = { status };
    if (currentTaskId) body.currentTaskId = currentTaskId;
    
    const res = await fetch(url, {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify(body),
    });
    
    if (!res.ok) {
      return null;
    }
    
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Update task status in OpenClaw Mission Control
 */
async function updateTaskStatus(taskId, agentId, status, options = {}) {
  const url = `${MISSION_CONTROL_URL}/api/tasks/${taskId}/status`;
  
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify({
        agentId,
        status,
        ...options,
      }),
    });
    
    if (!res.ok) {
      console.error(`[task:${taskId}] Status update failed: ${res.status}`);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error(`[task:${taskId}] Status error: ${err.message}`);
    return false;
  }
}

/**
 * Check if an agent has active OpenClaw sessions
 */
async function getAgentActiveSessions(agentId) {
  const openClawAgentId = resolveOpenClawAgentId(agentId);
  const sessionsDir = join(AGENTS_DIR, openClawAgentId, "sessions");
  const now = Date.now();

  try {
    const files = await readdir(sessionsDir);
    const sessionFiles = files.filter((f) => f.endsWith(".jsonl") && !f.includes(".deleted"));
    let activeCount = 0;

    for (const file of sessionFiles) {
      const fileStat = await stat(join(sessionsDir, file));
      if (now - fileStat.mtimeMs <= ACTIVE_SESSION_WINDOW_MS) {
        activeCount += 1;
      }
    }

    return activeCount;
  } catch {
    return 0;
  }
}

/**
 * Spawn an OpenClaw session for a task
 */
async function spawnOpenClawSession(agentId, task) {
  const openClawAgentId = resolveOpenClawAgentId(agentId);
  const statusEndpoint = `${MISSION_CONTROL_URL}/api/tasks/${task.id}/status`;
  const heartbeatEndpoint = `${MISSION_CONTROL_URL}/api/agents/${agentId}/heartbeat`;
  const authHint = AGENT_API_KEY
    ? "Include header: x-api-key: <configured AGENT_API_KEY>."
    : "If API auth is enabled, include x-api-key in requests.";

  const prompt = `OpenClaw Mission Control Task Assignment

Task ID: ${task.id}
Title: ${task.title}
Priority: ${task.priority}

Description:
${task.description || "No description provided."}

Instructions:
1. Start work immediately and report progress while you work.
2. POST status updates to:
   ${statusEndpoint}
   body: {"status":"in_progress","agentId":"${agentId}","output":"progress note"}
3. When complete, POST:
   {"status":"done","agentId":"${agentId}","output":"completion summary"}
4. If blocked, POST:
   {"status":"blocked","agentId":"${agentId}","output":"blocker details"}
5. Optional heartbeat endpoint:
   POST ${heartbeatEndpoint}
   body: {"status":"working","currentTaskId":"${task.id}"}
6. ${authHint}

Begin work now.`;

  // Generate a unique session id for this task
  const sessionId = `mc-task-${task.id.slice(0, 8)}`;
  
  console.log(`\n[${agentId.toUpperCase()}] 🚀 Starting: ${task.title}`);
  
  return new Promise((resolve) => {
    // Use spawn for non-blocking execution
    const child = spawn(OPENCLAW_CLI, [
      "agent",
      "--agent", openClawAgentId,
      "--session-id", sessionId,
      "--message", prompt,
      "--json"
    ], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 300000, // 5 minutes
    });
    
    // Don't wait for completion - agent will work asynchronously
    setTimeout(() => {
      console.log(`[${agentId.toUpperCase()}] ✓ Task dispatched → ${sessionId}`);
      resolve(sessionId);
    }, 2000); // Give it 2s to start
    
    child.on("close", (code) => {
      if (code === 0) {
        console.log(`[${agentId.toUpperCase()}] ✓ Task completed`);
      } else if (code !== null) {
        console.log(`[${agentId.toUpperCase()}] ⚠ Exited with code ${code}`);
      }
    });
    
    child.on("error", (err) => {
      console.error(`[${agentId.toUpperCase()}] ✗ Error: ${err.message}`);
      resolve(null);
    });
  });
}

/**
 * Update task session key in OpenClaw Mission Control
 */
async function setTaskSessionKey(taskId, sessionKey) {
  const url = `${MISSION_CONTROL_URL}/api/tasks/${taskId}/session`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify({ sessionKey }),
    });

    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Mark notification as delivered in OpenClaw Mission Control
 */
async function markNotificationDelivered(notificationId) {
  const url = `${MISSION_CONTROL_URL}/api/notifications/deliver`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify({ notificationId }),
    });

    return res.ok;
  } catch (err) {
    console.error(`[notification:${notificationId}] Delivery mark failed: ${err.message}`);
    return false;
  }
}

/**
 * Inject a notification into an agent's OpenClaw session
 */
async function injectNotification(agentId, notification) {
  const openClawAgentId = resolveOpenClawAgentId(agentId);
  const formattedMessage = `📬 Notification from OpenClaw Mission Control:

${notification.content}

${notification.taskId ? `Task: ${notification.taskId}` : ""}`;

  console.log(`[${agentId.toUpperCase()}] 📨 Injecting notification: ${notification.content.slice(0, 50)}...`);

  return new Promise((resolve) => {
    // Spawn OpenClaw CLI to inject message
    const child = spawn(OPENCLAW_CLI, [
      "agent",
      "--agent", openClawAgentId,
      "--message", formattedMessage,
      "--json"
    ], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000, // 30 seconds
    });

    // Give it 2s to inject
    setTimeout(async () => {
      console.log(`[${agentId.toUpperCase()}] ✓ Notification injected`);

      // Mark as delivered
      await markNotificationDelivered(notification.id);

      resolve(true);
    }, 2000);

    child.on("close", (code) => {
      if (code !== 0 && code !== null) {
        console.log(`[${agentId.toUpperCase()}] ⚠ Notification injection exited with code ${code}`);
      }
    });

    child.on("error", (err) => {
      console.error(`[${agentId.toUpperCase()}] ✗ Injection error: ${err.message}`);
      resolve(false);
    });
  });
}

/**
 * Main poll loop for a single agent
 */
async function pollAgent(agentId) {
  // Check if agent has active sessions (to set status)
  const activeSessions = await getAgentActiveSessions(agentId);
  const status = activeSessions > 0 ? "working" : "idle";
  
  // Call heartbeat
  const response = await agentHeartbeat(agentId, status);
  
  if (!response || !response.ok) {
    return { tasksFound: 0, newTasks: 0, deliveredNotifications: 0 };
  }
  
  const { tasks, notifications } = response;
  let tasksFound = 0;
  let newTasks = 0;
  let deliveredNotifications = 0;
  
  // Process assigned tasks that haven't been started
  if (tasks && tasks.length > 0) {
    tasksFound += tasks.length;
    for (const task of tasks) {
      // Skip if we already spawned a session for this task
      if (spawnedSessions.has(task.id)) {
        continue;
      }
      
      // Skip if task already has a session key (someone else started it)
      if (task.sessionKey) {
        spawnedSessions.set(task.id, task.sessionKey);
        continue;
      }
      
      // Only process newly assigned tasks (not already in_progress)
      if (task.status === "assigned") {
        newTasks += 1;
        // Mark as in_progress first
        await updateTaskStatus(task.id, agentId, "in_progress");
        
        // Spawn session (async)
        const sessionKey = await spawnOpenClawSession(agentId, task);
        
        if (sessionKey) {
          spawnedSessions.set(task.id, sessionKey);
          
          // Update task with session key
          const saved = await setTaskSessionKey(task.id, sessionKey);
          if (saved) {
            console.log(`[${agentId.toUpperCase()}] ✓ Session linked: ${sessionKey}`);
          }
        }
      }
    }
  }
  
  // Process and inject notifications into agent sessions
  if (notifications && notifications.length > 0) {
    console.log(`[${agentId.toUpperCase()}] 📬 ${notifications.length} notifications`);

    for (const notification of notifications) {
      const delivered = await injectNotification(agentId, notification);
      if (delivered) deliveredNotifications += 1;
    }
  }

  return { tasksFound, newTasks, deliveredNotifications };
}

/**
 * Main loop
 */
async function main() {
  console.log("🔗 Heartbeat Bridge Starting");
  console.log(`   OpenClaw Mission Control: ${MISSION_CONTROL_URL}`);
  console.log(`   Poll Interval: ${POLL_INTERVAL / 1000}s`);
  console.log(`   Agents Dir: ${AGENTS_DIR}\n`);
  
  // Verify OpenClaw Mission Control is reachable (retry during startup races).
  const maxStartupAttempts = Number(process.env.BRIDGE_STARTUP_ATTEMPTS ?? 45);
  const startupRetryDelayMs = Number(process.env.BRIDGE_STARTUP_RETRY_MS ?? 2000);
  let reachable = false;

  for (let attempt = 1; attempt <= maxStartupAttempts; attempt += 1) {
    try {
      const res = await fetch(`${MISSION_CONTROL_URL}/api/activity`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      reachable = true;
      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt === maxStartupAttempts) {
        console.error(`❌ Cannot reach OpenClaw Mission Control after ${maxStartupAttempts} attempts: ${message}`);
        console.error("   Bridge will keep running and retry on poll intervals.\n");
        break;
      }
      if (attempt === 1 || attempt % 10 === 0) {
        console.log(
          `⏳ Waiting for OpenClaw Mission Control (${attempt}/${maxStartupAttempts})...`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, startupRetryDelayMs));
    }
  }

  if (reachable) {
    console.log("✅ OpenClaw Mission Control is reachable\n");
  }

  const initialAgentIds = await refreshTrackedAgentIds(true);
  console.log(
    `   Initial Agents: ${initialAgentIds.map((id) => id.toUpperCase()).join(", ")}\n`
  );
  
  async function poll() {
    const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false });
    let tasksFound = 0;
    let newTasks = 0;
    let deliveredNotifications = 0;
    const agentIds = await refreshTrackedAgentIds();
    
    for (const agentId of agentIds) {
      try {
        const result = await pollAgent(agentId);
        tasksFound += result.tasksFound;
        newTasks += result.newTasks;
        deliveredNotifications += result.deliveredNotifications;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[${agentId.toUpperCase()}] Poll error: ${message}`);
      }
    }
    
    if (newTasks > 0 || tasksFound > 0 || deliveredNotifications > 0) {
      process.stdout.write(
        `[${timestamp}] ${tasksFound} active tasks, ${newTasks} dispatched, ${deliveredNotifications} notifications delivered\n`
      );
    }
  }
  
  // Initial poll
  await poll();
  
  // Poll loop
  setInterval(poll, POLL_INTERVAL);
  
  console.log("🏃 Bridge running. Press Ctrl+C to stop.\n");
}

main();
