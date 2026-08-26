import { spawn } from "node:child_process";

const ingestUrl =
  process.env.USAGE_INGEST_URL ?? "http://localhost:3000/api/usage/ingest";
const command =
  process.env.OPENCLAW_LOGS_COMMAND ?? "openclaw logs --follow --json";
const apiKey = process.env.AGENT_API_KEY?.trim();

const [bin, ...args] = command.split(" ");

function parsePayload(obj) {
  if (!obj || typeof obj !== "object") return null;

  const taskId =
    obj.taskId ??
    obj.task_id ??
    obj.task?.id ??
    obj.label ??
    obj.taskId?.toString();
  const agentId =
    obj.agentId ??
    obj.agent_id ??
    obj.agent ??
    obj.session?.agent ??
    obj.session?.agentId;

  if (!taskId || !agentId) return null;

  const tokensUsed =
    obj.tokensUsed ??
    obj.tokens ??
    obj.total_tokens ??
    obj.usage?.total_tokens ??
    obj.usage?.tokens;
  const costUsd =
    obj.costUsd ??
    obj.cost ??
    obj.cost_usd ??
    obj.usage?.cost_usd ??
    obj.usage?.cost;
  const output = obj.output ?? obj.result ?? obj.message ?? undefined;
  const status = obj.status ?? obj.taskStatus ?? undefined;

  return {
    taskId: String(taskId),
    agentId: String(agentId),
    tokensUsed: typeof tokensUsed === "number" ? tokensUsed : undefined,
    costUsd: typeof costUsd === "number" ? costUsd : undefined,
    output: typeof output === "string" ? output : undefined,
    status: typeof status === "string" ? status : undefined,
  };
}

async function ingest(payload) {
  try {
    await fetch(ingestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(apiKey ? { "x-api-key": apiKey } : {}) },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    process.stderr.write(
      `[usage] ingest error: ${err instanceof Error ? err.message : "unknown"}\n`
    );
  }
}

process.stdout.write(`[usage] listening with "${command}"\n`);

const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
let buffer = "";

child.stdout?.on("data", (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      const payload = parsePayload(obj);
      if (payload) ingest(payload);
    } catch {
      // ignore non-JSON lines
    }
  }
});

child.stderr?.on("data", (chunk) => {
  process.stderr.write(`[usage] ${chunk.toString()}`);
});

child.on("close", (code) => {
  process.stderr.write(`[usage] log stream closed (${code ?? 0})\n`);
});
