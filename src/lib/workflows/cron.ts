import { convex, api } from "@/lib/convexServer";
import { loadWorkflowSpec } from "@/lib/workflows/spec";
import { checkCronToolAvailable, createCronJob, listCronJobs, removeCronJobsByPrefix } from "@/lib/openclaw/gatewayTools";

const DEFAULT_EVERY_MS = 300_000; // 5 minutes (product default)

function buildAgentTurnPrompt(params: {
  missionControlUrl: string;
  workflowId: string;
  slotId: string;
  agentId: string;
}): string {
  const cliPath = process.env.MC_CLI_PATH?.trim() || `${process.cwd()}/scripts/mc.mjs`;
  const mcUrl = params.missionControlUrl.replace(/\/+$/, "");

  return `You are a OpenClaw Mission Control workflow agent. Check for pending work and execute it.

Environment:
- MISSION_CONTROL_URL=${mcUrl}
- MC_CLI_PATH=${cliPath}

Step 1 — Claim work:
\`\`\`
node "${cliPath}" step claim --workflow "${params.workflowId}" --slot "${params.slotId}" --agent "${params.agentId}"
\`\`\`

If output is "NO_WORK", reply HEARTBEAT_OK and stop.

Step 2 — If JSON is returned, it contains: {"stepId":"...","runId":"...","attemptId":"...","input":"...","expects":"...","leaseUntil":...}
The "input" field contains your FULLY RESOLVED instructions. Do exactly what it describes.

Step 3 — Start lease keepalive (recommended for long steps):
\`\`\`
(while true; do sleep 120; node "${cliPath}" step lease-extend --step "<stepId>" --agent "${params.agentId}" >/dev/null 2>&1 || true; done) &
echo $! > /tmp/mc-lease-keepalive.pid
\`\`\`

Step 4 — After completing the work, write output to a temp file, then pipe it:
\`\`\`
cat <<'MC_EOF' > /tmp/mc-step-output.txt
STATUS: done
KEY: value
...
MC_EOF
cat /tmp/mc-step-output.txt | node "${cliPath}" step complete "<stepId>" --agent "${params.agentId}"
\`\`\`

Note: attemptId is required for completion/fail/lease extension, but mc.mjs caches it from the claim step automatically.

Step 5 — Stop keepalive:
\`\`\`
if [ -f /tmp/mc-lease-keepalive.pid ]; then kill "$(cat /tmp/mc-lease-keepalive.pid)" >/dev/null 2>&1 || true; fi
\`\`\`

If the work FAILED and should be retried:
\`\`\`
node "${cliPath}" step fail "<stepId>" --agent "${params.agentId}" --error "what went wrong"
\`\`\`
`;
}

export async function ensureWorkflowCrons(params: { workflowId: string; missionControlUrl: string }) {
  const spec = await loadWorkflowSpec(params.workflowId);

  const mapping = await convex.query(api.workflows.listRoleMappings, { workflowId: params.workflowId });
  const map = new Map(mapping.map((m: any) => [m.slotId, m.agentId]));
  for (const agent of spec.agents) {
    if (!map.get(agent.id)) {
      throw new Error(`Workflow "${params.workflowId}" is missing role mapping for slot "${agent.id}".`);
    }
  }

  const settings = await convex.query(api.workflows.getWorkflowSettings, { workflowId: params.workflowId });
  const specEveryMs =
    (spec as any)?.cron && typeof (spec as any).cron === "object" && typeof (spec as any).cron.interval_ms === "number"
      ? (spec as any).cron.interval_ms
      : undefined;
  const everyMs = settings?.cronEveryMs ?? specEveryMs ?? DEFAULT_EVERY_MS;

  const preflight = await checkCronToolAvailable();
  if (!preflight.ok) {
    throw new Error(preflight.error ?? "Cron tool not available on gateway");
  }

  const prefix = `openclaw-mission-control/${params.workflowId}/`;
  const existing = await listCronJobs();
  if (existing.ok && existing.jobs && existing.jobs.some((j) => j.name.startsWith(prefix))) {
    return { ok: true, created: false };
  }

  // Create one cron per workflow slot (staggered by 1 minute).
  for (let i = 0; i < spec.agents.length; i++) {
    const slot = spec.agents[i];
    const agentId = map.get(slot.id)!;
    const anchorMs = i * 60_000;
    const name = `${prefix}${slot.id}`;
    const message = buildAgentTurnPrompt({
      missionControlUrl: params.missionControlUrl,
      workflowId: params.workflowId,
      slotId: slot.id,
      agentId,
    });

    const job = {
      name,
      schedule: { kind: "every", everyMs, anchorMs },
      sessionTarget: "isolated",
      agentId,
      payload: { kind: "agentTurn", message },
      delivery: { mode: "none" },
      enabled: true,
    };

    const result = await createCronJob(job);
    if (!result.ok) {
      throw new Error(`Failed to create cron job "${name}": ${result.error ?? "unknown error"}`);
    }
  }

  return { ok: true, created: true };
}

export async function teardownWorkflowCronsIfIdle(params: { workflowId: string }) {
  const count = await convex.query(api.workflows.countActiveRunsForWorkflow, { workflowId: params.workflowId });
  if (count.active > 0) return { ok: true, removed: false };
  const prefix = `openclaw-mission-control/${params.workflowId}/`;
  await removeCronJobsByPrefix(prefix);
  return { ok: true, removed: true };
}
