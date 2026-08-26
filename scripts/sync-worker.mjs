#!/usr/bin/env node
/**
 * Agent Sync Worker
 * Periodically syncs REAL usage data from OpenClaw sessions to Convex
 */

import { parseAllAgentUsage, getActiveSessions } from "./parse-usage.mjs";

const CONVEX_SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? process.env.CONVEX_SITE_URL;
const CONVEX_URL = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
const MISSION_CONTROL_URL = process.env.MISSION_CONTROL_URL ?? "http://127.0.0.1:3000";
const syncUrl = CONVEX_SITE_URL 
  ? `${CONVEX_SITE_URL}/api/agents/sync`
  : CONVEX_URL 
    ? `${CONVEX_URL.replace(/\.cloud$/, ".site")}/api/agents/sync`
    : `${MISSION_CONTROL_URL}/api/agents/sync`;
const interval = Number(process.env.SYNC_INTERVAL_MS ?? 30000); // 30 seconds
const apiKey = process.env.AGENT_API_KEY?.trim();

async function sync() {
  try {
    // Parse REAL usage data from OpenClaw session files
    const usage = await parseAllAgentUsage();
    const active = await getActiveSessions();

    // Transform to API format
    const usageSyncedAt = Date.now();
    const usageData = Object.entries(usage).map(([agentId, data]) => ({
      agentId,
      totalCost: data.totalCost,
      totalTokens: data.totalTokens,
      todayCost: data.todayCost ?? 0,
      todayTokens: data.todayTokens ?? 0,
      usageSyncedAt,
      lastActivity: data.lastActivity,
    }));

    const activeAgents = Object.entries(active).map(([agentId, data]) => ({
      agentId,
      activeSessions: data.activeSessions,
      lastActivity: data.lastActivity,
    }));

    if (usageData.length === 0) {
      process.stdout.write(`[sync] no agent usage data found\n`);
      return;
    }

    // POST to Convex
    const res = await fetch(syncUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(apiKey ? { "x-api-key": apiKey } : {}) },
      body: JSON.stringify({ usageData, activeAgents }),
    });

    const data = await res.json();
    
    if (data?.success) {
      const updates = data.agentsUpdated ?? 0;
      const created = data.agentsCreated ?? 0;
      const activeCount = data.activeAgents ?? 0;
      
      // Calculate totals for logging
      const totalCost = usageData.reduce((sum, d) => sum + d.totalCost, 0);
      const totalTokens = usageData.reduce((sum, d) => sum + d.totalTokens, 0);
      const totalTodayCost = usageData.reduce((sum, d) => sum + (d.todayCost ?? 0), 0);
      
      process.stdout.write(
        `[sync] ✓ ${updates} updated, ${created} created | ` +
        `$${totalCost.toFixed(2)} lifetime ($${totalTodayCost.toFixed(2)} today) / ${(totalTokens / 1000000).toFixed(1)}M tokens | ` +
        `${activeCount} active\n`
      );
    } else if (data?.error) {
      process.stderr.write(`[sync] ✗ error: ${data.error}\n`);
    }
  } catch (err) {
    process.stderr.write(
      `[sync] ✗ error: ${err instanceof Error ? err.message : "unknown"}\n`
    );
  }
}

process.stdout.write(`[sync] Starting real usage sync worker\n`);
process.stdout.write(`[sync] Syncing to: ${syncUrl}\n`);
process.stdout.write(`[sync] Interval: ${interval}ms\n`);

// Run immediately, then on interval
sync();
setInterval(sync, interval);
