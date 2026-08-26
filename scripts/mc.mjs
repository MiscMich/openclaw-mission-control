#!/usr/bin/env node
/* OpenClaw Mission Control workflow CLI.
 *
 * This is intentionally tiny and boring. It exists so OpenClaw cron agent-turn
 * prompts can call deterministic commands instead of hand-rolled curl.
 */

import process from "node:process";

function usage() {
  process.stdout.write(
    [
      "mc step claim --workflow <id> --slot <slot> --agent <agentId>",
      "mc step complete <stepId> --agent <agentId> --attemptId <id>    (reads output from stdin if not provided)",
      "mc step fail <stepId> --agent <agentId> --attemptId <id> --error <text>",
      "mc step lease-extend --step <stepId> --agent <agentId> --attemptId <id>",
    ].join("\n") + "\n"
  );
}

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on("data", (c) => chunks.push(Buffer.from(c)));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    process.stdin.on("error", () => resolve(""));
  });
}

function getMissionControlUrl() {
  const configured = process.env.MISSION_CONTROL_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const port = process.env.MISSION_CONTROL_PORT?.trim() || "3000";
  return `http://127.0.0.1:${port}`;
}

async function postJson(path, body) {
  const url = `${getMissionControlUrl()}${path}`;
  const headers = { "content-type": "application/json" };
  if (process.env.AGENT_API_KEY?.trim()) headers["x-api-key"] = process.env.AGENT_API_KEY.trim();

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) {
    process.stderr.write(text || `Request failed (${res.status})\n`);
    process.exit(1);
  }
  return text ? JSON.parse(text) : null;
}

function popFlag(args, name) {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  const v = args[idx + 1];
  args.splice(idx, 2);
  return v;
}

async function main() {
  const argv = process.argv.slice(2);
  const [group, actionOrId, ...rest] = argv;

  if (!group) {
    usage();
    process.exit(1);
  }

  if (group !== "step") {
    usage();
    process.exit(1);
  }

  if (actionOrId === "claim") {
    const args = [...rest];
    const workflowId = popFlag(args, "--workflow");
    const slotId = popFlag(args, "--slot");
    const agentId = popFlag(args, "--agent");
    if (!workflowId || !slotId || !agentId) {
      process.stderr.write("Missing required flags for claim.\n");
      usage();
      process.exit(1);
    }
    const result = await postJson("/api/workflows/steps/claim", { workflowId, slotId, agentId });
    if (!result?.found) {
      process.stdout.write("NO_WORK\n");
      return;
    }
    process.stdout.write(JSON.stringify(result) + "\n");
    return;
  }

  if (actionOrId === "complete") {
    const stepId = rest[0];
    const args = rest.slice(1);
    const agentId = popFlag(args, "--agent");
    const attemptId = popFlag(args, "--attemptId") || popFlag(args, "--attempt-id");
    if (!stepId || !agentId || !attemptId) {
      process.stderr.write("Missing stepId, --agent, or --attemptId for complete.\n");
      usage();
      process.exit(1);
    }
    let output = args.join(" ").trim();
    if (!output) output = (await readStdin()).trim();
    const result = await postJson("/api/workflows/steps/complete", { stepId, agentId, attemptId, output });
    process.stdout.write(JSON.stringify(result) + "\n");
    return;
  }

  if (actionOrId === "fail") {
    const stepId = rest[0];
    const args = rest.slice(1);
    const agentId = popFlag(args, "--agent");
    const attemptId = popFlag(args, "--attemptId") || popFlag(args, "--attempt-id");
    const error = popFlag(args, "--error") || args.join(" ").trim() || "Unknown error";
    if (!stepId || !agentId || !attemptId) {
      process.stderr.write("Missing stepId, --agent, or --attemptId for fail.\n");
      usage();
      process.exit(1);
    }
    const result = await postJson("/api/workflows/steps/fail", { stepId, agentId, attemptId, error });
    process.stdout.write(JSON.stringify(result) + "\n");
    return;
  }

  if (actionOrId === "lease-extend") {
    const args = [...rest];
    const stepId = popFlag(args, "--step");
    const agentId = popFlag(args, "--agent");
    const attemptId = popFlag(args, "--attemptId") || popFlag(args, "--attempt-id");
    if (!stepId || !agentId || !attemptId) {
      process.stderr.write("Missing --step, --agent, or --attemptId for lease-extend.\n");
      usage();
      process.exit(1);
    }
    const result = await postJson("/api/workflows/steps/lease/extend", { stepId, agentId, attemptId });
    process.stdout.write(JSON.stringify(result) + "\n");
    return;
  }

  usage();
  process.exit(1);
}

main().catch((err) => {
  process.stderr.write((err && err.stack) ? String(err.stack) : String(err) + "\n");
  process.exit(1);
});
