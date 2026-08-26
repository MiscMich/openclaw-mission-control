#!/usr/bin/env node
/**
 * Activity Watcher
 * Monitors OpenClaw session files and logs REAL events to Convex
 */

import { watch } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { requireAbsoluteConfiguredPath } from "./configured-paths.mjs";

const AGENTS_DIR = requireAbsoluteConfiguredPath("OPENCLAW_AGENTS_DIR");

const CONVEX_SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? process.env.CONVEX_SITE_URL;
const MISSION_CONTROL_URL = process.env.MISSION_CONTROL_URL ?? "http://127.0.0.1:3000";
const AGENT_API_KEY = process.env.AGENT_API_KEY ?? "";
const activityUrl = CONVEX_SITE_URL 
  ? `${CONVEX_SITE_URL}/api/activity`
  : `${MISSION_CONTROL_URL}/api/activity`;

// Track what we've already logged to avoid duplicates
const loggedEvents = new Set();

// Track file positions for incremental reading
const filePositions = new Map();
const sessionTaskIds = new Map();
const titleResolutionCache = new Map();

function requestHeaders() {
  return AGENT_API_KEY
    ? { "Content-Type": "application/json", "x-api-key": AGENT_API_KEY }
    : { "Content-Type": "application/json" };
}

function extractTaskIdFromText(text) {
  if (!text) return null;

  const explicitTaskId = text.match(/\bTask ID:\s*([a-zA-Z0-9-]{6,})/i);
  if (explicitTaskId?.[1]) return explicitTaskId[1];

  const jsonTaskId = text.match(/"taskId"\s*:\s*"([^"]+)"/i);
  if (jsonTaskId?.[1]) return jsonTaskId[1];

  const legacyTaskId = text.match(/"task_id"\s*:\s*"([^"]+)"/i);
  if (legacyTaskId?.[1]) return legacyTaskId[1];

  return null;
}

function extractTaskTitleFromText(text) {
  if (!text) return null;

  const startTask = text.match(/\bStart task:\s*(.+)/i);
  if (startTask?.[1]) {
    const title = startTask[1].split("\n")[0].trim();
    return title || null;
  }

  const taskTitle = text.match(/\bTitle:\s*(.+)/i);
  if (taskTitle?.[1]) {
    const title = taskTitle[1].split("\n")[0].trim();
    return title || null;
  }

  return null;
}

async function resolveTaskIdFromTitle(agentId, title) {
  const normalizedTitle = title.trim().toLowerCase();
  if (!normalizedTitle) return null;

  const cacheKey = `${agentId}:${normalizedTitle}`;
  if (titleResolutionCache.has(cacheKey)) {
    return titleResolutionCache.get(cacheKey);
  }

  try {
    const res = await fetch(
      `${MISSION_CONTROL_URL}/api/agents/${encodeURIComponent(agentId)}/tasks`,
      {
        headers: AGENT_API_KEY ? { "x-api-key": AGENT_API_KEY } : undefined,
      }
    );
    if (!res.ok) {
      titleResolutionCache.set(cacheKey, null);
      return null;
    }

    const payload = await res.json();
    const tasks = Array.isArray(payload?.tasks) ? payload.tasks : [];
    const matches = tasks
      .filter((task) => typeof task?.title === "string")
      .filter((task) => task.title.trim().toLowerCase() === normalizedTitle);

    const preferred = matches
      .sort((a, b) => (Number(b?.updatedAt ?? 0) - Number(a?.updatedAt ?? 0)))
      .find((task) =>
        ["in_progress", "assigned", "review", "open", "inbox"].includes(task?.status)
      ) ?? matches[0];

    const resolvedTaskId = typeof preferred?.id === "string" ? preferred.id : null;
    titleResolutionCache.set(cacheKey, resolvedTaskId);
    return resolvedTaskId;
  } catch {
    titleResolutionCache.set(cacheKey, null);
    return null;
  }
}

async function logActivity(type, message, agentId, taskId = null) {
  const key = `${type}:${message}:${agentId}:${taskId ?? "none"}`;
  if (loggedEvents.has(key)) return;
  loggedEvents.add(key);
  
  // Limit cache size
  if (loggedEvents.size > 10000) {
    const toDelete = [...loggedEvents].slice(0, 5000);
    toDelete.forEach(k => loggedEvents.delete(k));
  }
  
  try {
    await fetch(activityUrl, {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify({ type, message, agentId, taskId }),
    });
    process.stdout.write(`[activity] ${type}: ${message}\n`);
  } catch (err) {
    process.stderr.write(`[activity] error: ${err.message}\n`);
  }
}

/**
 * Parse session events from JSONL file (incremental)
 */
async function parseSessionEvents(filePath, agentId) {
  try {
    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    
    const startPos = filePositions.get(filePath) ?? 0;
    filePositions.set(filePath, lines.length);
    let sessionTaskId = sessionTaskIds.get(filePath) ?? null;
    
    // Only process new lines
    const newLines = lines.slice(startPos);
    
    for (const line of newLines) {
      try {
        const entry = JSON.parse(line);
        
        // Session started
        if (entry.type === "session" && startPos === 0) {
          await logActivity(
            "agent_session_start",
            `${agentId.toUpperCase()} started a new session`,
            agentId,
            sessionTaskId
          );
        }
        
        if (entry.type === "message" && Array.isArray(entry.message?.content)) {
          for (const block of entry.message.content) {
            if (block.type !== "text" || typeof block.text !== "string") continue;

            if (!sessionTaskId) {
              const extractedTaskId = extractTaskIdFromText(block.text);
              if (extractedTaskId) {
                sessionTaskId = extractedTaskId;
                sessionTaskIds.set(filePath, extractedTaskId);
                continue;
              }
            }

            if (!sessionTaskId && entry.message?.role === "user") {
              const title = extractTaskTitleFromText(block.text);
              if (title) {
                const resolvedTaskId = await resolveTaskIdFromTitle(agentId, title);
                if (resolvedTaskId) {
                  sessionTaskId = resolvedTaskId;
                  sessionTaskIds.set(filePath, resolvedTaskId);
                }
              }
            }
          }
        }

        // Tool calls (task activity)
        if (entry.type === "message" && entry.message?.role === "assistant") {
          const content = entry.message.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              // Detect task-related tool calls
              if (block.type === "toolCall") {
                const name = block.name;
                const args = block.arguments;
                const normalizedName =
                  typeof name === "string" ? name.trim().toLowerCase() : "";
                
                // exec commands
                if (normalizedName === "exec" && args?.command) {
                  const cmd = args.command;
                  // Git commits
                  if (cmd.includes("git commit")) {
                    const match = cmd.match(/-m ["']([^"']+)["']/);
                    const commitMsg = match ? match[1] : "code changes";
                    await logActivity(
                      "code_committed",
                      `${agentId.toUpperCase()} committed: ${commitMsg.substring(0, 60)}...`,
                      agentId,
                      sessionTaskId
                    );
                  }
                  // Deploy commands
                  if (cmd.includes("deploy") || cmd.includes("npx convex push")) {
                    await logActivity(
                      "deployment",
                      `${agentId.toUpperCase()} triggered a deployment`,
                      agentId,
                      sessionTaskId
                    );
                  }
                }
                
                // File writes/edits
                if ((normalizedName === "write" || normalizedName === "edit") && args) {
                  const pathValue =
                    (typeof args.path === "string" && args.path) ||
                    (typeof args.file === "string" && args.file) ||
                    (typeof args.filename === "string" && args.filename) ||
                    (typeof args.target === "string" && args.target) ||
                    "";

                  const file = pathValue ? basename(pathValue) : "a file";
                  await logActivity(
                    "file_modified",
                    `${agentId.toUpperCase()} edited ${file}`,
                    agentId,
                    sessionTaskId
                  );
                }

                // Web search
                if (normalizedName === "web_search" && args) {
                  const query =
                    (typeof args.query === "string" && args.query) ||
                    (typeof args.q === "string" && args.q) ||
                    (typeof args.search === "string" && args.search) ||
                    "";
                  const normalizedQuery = query.trim().replace(/\s+/g, " ");
                  if (normalizedQuery) {
                    await logActivity(
                      "web_search",
                      `${agentId.toUpperCase()} searched web: ${normalizedQuery.substring(0, 160)}`,
                      agentId,
                      sessionTaskId
                    );
                  }
                }

                // Web fetch
                if (normalizedName === "web_fetch" && args) {
                  const url =
                    (typeof args.url === "string" && args.url) ||
                    (typeof args.href === "string" && args.href) ||
                    (typeof args.uri === "string" && args.uri) ||
                    "";
                  const normalizedUrl = url.trim();
                  if (normalizedUrl) {
                    await logActivity(
                      "web_fetch",
                      `${agentId.toUpperCase()} fetched: ${normalizedUrl.substring(0, 200)}`,
                      agentId,
                      sessionTaskId
                    );
                  }
                }

                // Outbound message (Telegram/Slack/etc)
                if (normalizedName === "message" && args) {
                  const provider =
                    (typeof args.provider === "string" && args.provider) ||
                    (typeof args.service === "string" && args.service) ||
                    (typeof args.integration === "string" && args.integration) ||
                    "";
                  const target =
                    (typeof args.channel === "string" && args.channel) ||
                    (typeof args.target === "string" && args.target) ||
                    (typeof args.to === "string" && args.to) ||
                    (typeof args.chatId === "string" && args.chatId) ||
                    "";

                  const destination = provider
                    ? target
                      ? `${provider}:${target}`
                      : provider
                    : target;

                  await logActivity(
                    "message_sent",
                    destination
                      ? `${agentId.toUpperCase()} sent message to ${destination}`
                      : `${agentId.toUpperCase()} sent message`,
                    agentId,
                    sessionTaskId
                  );
                }
              }
              
              // Detect text mentions of tasks
              if (block.type === "text" && typeof block.text === "string") {
                const text = block.text;
                
                // Task completion patterns
                if (/\b(completed|finished|done|shipped)\b/i.test(text) && 
                    /\b(task|feature|fix|implementation)\b/i.test(text)) {
                  const summary = text.substring(0, 100).replace(/\n/g, " ");
                  await logActivity(
                    "task_progress",
                    `${agentId.toUpperCase()}: ${summary}...`,
                    agentId,
                    sessionTaskId
                  );
                }
              }
            }
          }
        }
        
        // Subagent spawned
        if (entry.type === "custom" && entry.customType === "openclaw.subagent-spawn") {
          const label = entry.data?.label ?? "subagent";
          await logActivity(
            "agent_spawned",
            `${agentId.toUpperCase()} spawned subagent: ${label}`,
            agentId,
            sessionTaskId
          );
        }
        
      } catch {
        // Skip invalid JSON
      }
    }
  } catch (err) {
    // Session files can rotate/delete while we're parsing; ignore those races.
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      filePositions.delete(filePath);
      sessionTaskIds.delete(filePath);
      return;
    }
    process.stderr.write(`[activity] error reading ${filePath}: ${err.message}\n`);
  }
}

/**
 * Watch all agent session directories
 */
async function watchAllAgents() {
  try {
    const agents = await readdir(AGENTS_DIR);
    
    for (const agentId of agents) {
      if (agentId.startsWith(".")) continue;
      
      const sessionsDir = join(AGENTS_DIR, agentId, "sessions");
      
      try {
        await stat(sessionsDir);
        
        // Initial scan of active sessions
        const files = await readdir(sessionsDir);
        for (const file of files) {
          if (file.endsWith(".jsonl") && !file.includes(".deleted")) {
            const filePath = join(sessionsDir, file);
            await parseSessionEvents(filePath, agentId);
          }
        }
        
        // Watch for changes
        watch(sessionsDir, async (eventType, filename) => {
          if (!filename || !filename.endsWith(".jsonl")) return;
          if (filename.includes(".deleted")) return;
          
          const filePath = join(sessionsDir, filename);
          
          // Small delay to let writes complete
          setTimeout(async () => {
            try {
              await parseSessionEvents(filePath, agentId);
            } catch {
              // File might be deleted
            }
          }, 100);
        });
        
        process.stdout.write(`[activity] watching: ${agentId}\n`);
        
      } catch {
        // No sessions directory
      }
    }
  } catch (err) {
    process.stderr.write(`[activity] error: ${err.message}\n`);
  }
}

// Also watch for new agents
async function watchAgentsDir() {
  try {
    watch(AGENTS_DIR, async (eventType, filename) => {
      if (!filename || filename.startsWith(".")) return;
      
      const agentPath = join(AGENTS_DIR, filename);
      try {
        const s = await stat(agentPath);
        if (s.isDirectory()) {
          await logActivity(
            "agent_discovered",
            `New agent discovered: ${filename.toUpperCase()}`,
            filename
          );
          // Watch this new agent
          const sessionsDir = join(agentPath, "sessions");
          try {
            await stat(sessionsDir);
            watch(sessionsDir, async (_, file) => {
              if (!file || !file.endsWith(".jsonl") || file.includes(".deleted")) return;
              setTimeout(() => parseSessionEvents(join(sessionsDir, file), filename), 100);
            });
          } catch {}
        }
      } catch {}
    });
  } catch {}
}

process.stdout.write(`[activity] Starting activity watcher\n`);
process.stdout.write(`[activity] Watching: ${AGENTS_DIR}\n`);
process.stdout.write(`[activity] Posting to: ${activityUrl}\n`);

watchAllAgents();
watchAgentsDir();

// Keep alive
setInterval(() => {}, 60000);
