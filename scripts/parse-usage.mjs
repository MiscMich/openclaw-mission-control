#!/usr/bin/env node
/**
 * Parse REAL usage data from OpenClaw agent session JSONL files
 * Outputs: { agentId: { totalCost, totalTokens, sessionCount, lastActivity } }
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { requireAbsoluteConfiguredPath } from "./configured-paths.mjs";

const AGENTS_DIR = requireAbsoluteConfiguredPath("OPENCLAW_AGENTS_DIR");
const ACTIVE_SESSION_WINDOW_MS = Number(
  process.env.ACTIVE_SESSION_WINDOW_MS ?? 60_000
);
const AGENT_ID_ALIASES = {
  main: "coordinator",
};
const TODAY_START_MS = (() => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
})();

function toTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

/**
 * Parse a single JSONL file and extract usage data
 */
async function parseSessionFile(filePath) {
  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n").filter(Boolean);
  
  let totalCost = 0;
  let totalTokens = 0;
  let todayCost = 0;
  let todayTokens = 0;
  let messageCount = 0;
  let lastTimestamp = null;
  
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      
      const entryTimestamp = toTimestamp(entry.timestamp);

      // Track last timestamp from any entry
      if (entryTimestamp && (!lastTimestamp || entryTimestamp > lastTimestamp)) {
        lastTimestamp = entryTimestamp;
      }
      
      // Only process message entries with usage data
      if (entry.type === "message" && entry.message?.usage) {
        const usage = entry.message.usage;
        
        // Cost is in usage.cost.total
        if (usage.cost?.total && typeof usage.cost.total === "number") {
          totalCost += usage.cost.total;
          if (entryTimestamp && entryTimestamp >= TODAY_START_MS) {
            todayCost += usage.cost.total;
          }
        }
        
        // Tokens are in usage.totalTokens
        if (usage.totalTokens && typeof usage.totalTokens === "number") {
          totalTokens += usage.totalTokens;
          if (entryTimestamp && entryTimestamp >= TODAY_START_MS) {
            todayTokens += usage.totalTokens;
          }
        }
        
        messageCount++;
      }
    } catch {
      // Skip invalid JSON lines
    }
  }
  
  return { totalCost, totalTokens, todayCost, todayTokens, messageCount, lastTimestamp };
}

/**
 * Get all session files for an agent (including .deleted files for historical data)
 */
async function getAgentSessionFiles(agentId) {
  const sessionsDir = join(AGENTS_DIR, agentId, "sessions");
  
  try {
    const files = await readdir(sessionsDir);
    return files
      .filter(f => f.endsWith(".jsonl") || f.includes(".jsonl.deleted"))
      .map(f => join(sessionsDir, f));
  } catch {
    return [];
  }
}

/**
 * Parse all usage data for all agents
 */
export async function parseAllAgentUsage() {
  const results = {};
  
  try {
    const agents = await readdir(AGENTS_DIR);
    
    for (const agentId of agents) {
      // Skip hidden files
      if (agentId.startsWith(".")) continue;
      const canonicalAgentId = AGENT_ID_ALIASES[agentId] ?? agentId;
      
      const agentPath = join(AGENTS_DIR, agentId);
      const agentStat = await stat(agentPath);
      if (!agentStat.isDirectory()) continue;
      
      const sessionFiles = await getAgentSessionFiles(agentId);
      
      let agentTotalCost = 0;
      let agentTotalTokens = 0;
      let agentTodayCost = 0;
      let agentTodayTokens = 0;
      let agentMessageCount = 0;
      let agentLastActivity = null;
      
      for (const file of sessionFiles) {
        try {
          const { totalCost, totalTokens, todayCost, todayTokens, messageCount, lastTimestamp } = 
            await parseSessionFile(file);
          
          agentTotalCost += totalCost;
          agentTotalTokens += totalTokens;
          agentTodayCost += todayCost;
          agentTodayTokens += todayTokens;
          agentMessageCount += messageCount;
          
          if (lastTimestamp && (!agentLastActivity || lastTimestamp > agentLastActivity)) {
            agentLastActivity = lastTimestamp;
          }
        } catch (err) {
          console.error(`Error parsing ${file}:`, err.message);
        }
      }
      
      const existing = results[canonicalAgentId];
      results[canonicalAgentId] = {
        totalCost:
          Math.round(((existing?.totalCost ?? 0) + agentTotalCost) * 1000000) / 1000000,
        totalTokens: (existing?.totalTokens ?? 0) + agentTotalTokens,
        todayCost:
          Math.round(((existing?.todayCost ?? 0) + agentTodayCost) * 1000000) / 1000000,
        todayTokens: (existing?.todayTokens ?? 0) + agentTodayTokens,
        messageCount: (existing?.messageCount ?? 0) + agentMessageCount,
        sessionCount: (existing?.sessionCount ?? 0) + sessionFiles.length,
        lastActivity: Math.max(existing?.lastActivity ?? 0, agentLastActivity ?? 0) || null,
      };
    }
  } catch (err) {
    console.error("Error reading agents directory:", err.message);
  }
  
  return results;
}

/**
 * Get active sessions based on recent file activity.
 * A session is considered active when its JSONL file was modified
 * within ACTIVE_SESSION_WINDOW_MS.
 */
export async function getActiveSessions() {
  const active = {};
  const now = Date.now();
  
  try {
    const agents = await readdir(AGENTS_DIR);
    
    for (const agentId of agents) {
      if (agentId.startsWith(".")) continue;
      const canonicalAgentId = AGENT_ID_ALIASES[agentId] ?? agentId;
      
      const sessionsDir = join(AGENTS_DIR, agentId, "sessions");
      try {
        const files = await readdir(sessionsDir);
        const sessionFiles = files.filter((f) => f.endsWith(".jsonl") && !f.includes(".deleted"));
        let activeCount = 0;
        let lastActivity = null;

        for (const file of sessionFiles) {
          const fileStat = await stat(join(sessionsDir, file));
          if (!lastActivity || fileStat.mtimeMs > lastActivity) {
            lastActivity = fileStat.mtimeMs;
          }
          if (now - fileStat.mtimeMs <= ACTIVE_SESSION_WINDOW_MS) {
            activeCount += 1;
          }
        }

        if (activeCount > 0) {
          const existing = active[canonicalAgentId];
          active[canonicalAgentId] = {
            activeSessions: (existing?.activeSessions ?? 0) + activeCount,
            lastActivity: Math.max(existing?.lastActivity ?? 0, lastActivity ?? 0) || null,
          };
        }
      } catch {
        // No sessions directory
      }
    }
  } catch {
    // No agents directory
  }
  
  return active;
}

// Run as CLI
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const usage = await parseAllAgentUsage();
  const active = await getActiveSessions();
  
  console.log("\n📊 REAL Agent Usage Data (from OpenClaw sessions)\n");
  console.log("─".repeat(70));
  
  for (const [agentId, data] of Object.entries(usage)) {
    const isActive = active[agentId] ? "🟢" : "⚪";
    console.log(`${isActive} ${agentId.toUpperCase()}`);
    console.log(
      `   Cost: $${data.totalCost.toFixed(4)} | Tokens: ${data.totalTokens.toLocaleString()} | ` +
      `Today: $${data.todayCost.toFixed(4)} / ${data.todayTokens.toLocaleString()}`
    );
    console.log(`   Messages: ${data.messageCount}`);
    console.log(`   Sessions: ${data.sessionCount} | Last: ${data.lastActivity ? new Date(data.lastActivity).toISOString() : "N/A"}`);
    console.log();
  }
  
  // Summary
  const totalCost = Object.values(usage).reduce((sum, d) => sum + d.totalCost, 0);
  const totalTokens = Object.values(usage).reduce((sum, d) => sum + d.totalTokens, 0);
  
  console.log("─".repeat(70));
  console.log(`💰 TOTAL: $${totalCost.toFixed(4)} | ${totalTokens.toLocaleString()} tokens`);
  console.log(`🤖 Active agents: ${Object.keys(active).length}`);
}
