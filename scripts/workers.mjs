#!/usr/bin/env node
/**
 * OpenClaw Mission Control Workers
 * Runs all background workers for real-time data sync
 */

import { spawn } from "node:child_process";

const MISSION_CONTROL_PORT = process.env.MISSION_CONTROL_PORT ?? "3000";
const MISSION_CONTROL_URL =
  process.env.MISSION_CONTROL_URL ?? `http://127.0.0.1:${MISSION_CONTROL_PORT}`;
const CONVEX_SITE_URL =
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
  process.env.CONVEX_SITE_URL ??
  MISSION_CONTROL_URL;

// Set environment for all workers
process.env.NEXT_PUBLIC_CONVEX_SITE_URL = CONVEX_SITE_URL;
process.env.MISSION_CONTROL_URL = MISSION_CONTROL_URL;
process.env.MISSION_CONTROL_PORT = MISSION_CONTROL_PORT;

const workers = [
  { name: "sync", cmd: ["node", "scripts/sync-worker.mjs"], desc: "Real usage data sync" },
  { name: "activity", cmd: ["node", "scripts/activity-watcher.mjs"], desc: "Real-time activity feed" },
  { name: "bridge", cmd: ["node", "scripts/heartbeat-bridge.mjs"], desc: "OpenClaw ↔ OpenClaw Mission Control bridge" },
  { name: "inbound", cmd: ["node", "scripts/inbound-chat-worker.mjs"], desc: "Inbound external chat ingestion" },
  { name: "notify", cmd: ["node", "scripts/notification-worker.mjs"], desc: "Notification delivery" },
  { name: "standup", cmd: ["node", "scripts/standup-worker.mjs"], desc: "Daily standup generation" },
];

console.log("🚀 Starting OpenClaw Mission Control Workers\n");
console.log(`   Convex Site: ${CONVEX_SITE_URL}\n`);
console.log(`   OpenClaw Mission Control: ${MISSION_CONTROL_URL}\n`);

const children = new Map();
const restartTimers = new Map();
let shuttingDown = false;
const workerEnv = {
  ...process.env,
  NEXT_PUBLIC_CONVEX_SITE_URL: CONVEX_SITE_URL,
  CONVEX_SITE_URL,
  MISSION_CONTROL_URL,
  MISSION_CONTROL_PORT,
};

function clearRestartTimer(workerName) {
  const timer = restartTimers.get(workerName);
  if (timer) {
    clearTimeout(timer);
    restartTimers.delete(workerName);
  }
}

function startWorker(worker) {
  clearRestartTimer(worker.name);

  console.log(`   [${worker.name}] ${worker.desc}`);
  const [bin, ...args] = worker.cmd;
  const child = spawn(bin, args, { stdio: "inherit", env: workerEnv });
  children.set(worker.name, child);

  child.on("close", (code) => {
    children.delete(worker.name);
    if (shuttingDown) {
      process.stderr.write(`[workers] ${worker.name} exited (${code ?? 0})\n`);
      return;
    }

    process.stderr.write(
      `[workers] ${worker.name} exited (${code ?? 0}), restarting in 3s\n`
    );
    const timer = setTimeout(() => {
      restartTimers.delete(worker.name);
      if (!shuttingDown) {
        startWorker(worker);
      }
    }, 3000);
    restartTimers.set(worker.name, timer);
  });
}

for (const worker of workers) {
  startWorker(worker);
}

console.log("\n   Workers running. Press Ctrl+C to stop.\n");

process.on("SIGINT", () => {
  shuttingDown = true;
  console.log("\n   Shutting down workers...");
  for (const timer of restartTimers.values()) {
    clearTimeout(timer);
  }
  restartTimers.clear();
  for (const child of children.values()) {
    try {
      child.kill("SIGINT");
    } catch {
      // ignore
    }
  }
  process.exit(0);
});
