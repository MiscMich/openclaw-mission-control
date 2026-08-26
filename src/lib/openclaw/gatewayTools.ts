import { getOpenClawGatewayConnectionFromHome } from "./openclawConfig";

export type GatewayToolInvokeResult =
  | { ok: true; result: any }
  | { ok: false; status?: number; error: string };

export async function invokeGatewayTool(params: {
  tool: string;
  args: Record<string, unknown>;
  sessionKey?: string;
}): Promise<GatewayToolInvokeResult> {
  const gateway = await getOpenClawGatewayConnectionFromHome();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.OPENCLAW_GATEWAY_TOKEN && process.env.OPENCLAW_GATEWAY_TOKEN.trim()) {
    headers["Authorization"] = `Bearer ${process.env.OPENCLAW_GATEWAY_TOKEN.trim()}`;
  } else if (gateway.token) {
    headers["Authorization"] = `Bearer ${gateway.token}`;
  }

  const url =
    (process.env.OPENCLAW_GATEWAY_URL && process.env.OPENCLAW_GATEWAY_URL.trim())
      ? process.env.OPENCLAW_GATEWAY_URL.trim().replace(/\/+$/, "") + "/tools/invoke"
      : `${gateway.url}/tools/invoke`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        tool: params.tool,
        args: params.args,
        ...(params.sessionKey ? { sessionKey: params.sessionKey } : {}),
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 404) {
        return {
          ok: false,
          status: 404,
          error:
            `OpenClaw gateway returned 404 for /tools/invoke (tool="${params.tool}"). ` +
            "This usually means either: " +
            "(1) the gateway is not running on the configured port, or " +
            "(2) tool access is restricted by your OpenClaw tool policy. " +
            'Check ~/.openclaw/openclaw.json: gateway.port, gateway.auth.token, and tools.profile/tools.allow/tools.deny.',
        };
      }
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          status: res.status,
          error:
            `OpenClaw gateway returned ${res.status} (tool="${params.tool}"). ` +
            "Your gateway auth token is missing or invalid. " +
            "Check ~/.openclaw/openclaw.json: gateway.auth.token.",
        };
      }
      return { ok: false, status: res.status, error: `Gateway returned ${res.status}: ${text}` };
    }

    const json = await res.json().catch(() => null);
    if (!json || typeof json !== "object") {
      return { ok: false, error: "Gateway returned non-JSON response" };
    }
    if ((json as any).ok === false) {
      return { ok: false, error: (json as any).error?.message ?? "Gateway tool invocation failed" };
    }
    return { ok: true, result: json };
  } catch (err) {
    return { ok: false, error: `Cannot reach OpenClaw gateway: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function checkCronToolAvailable(): Promise<{ ok: boolean; error?: string }> {
  const res = await invokeGatewayTool({ tool: "cron", args: { action: "list" }, sessionKey: "global" });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true };
}

export async function listCronJobs(): Promise<{ ok: boolean; jobs?: Array<{ id: string; name: string }>; error?: string }> {
  const res = await invokeGatewayTool({ tool: "cron", args: { action: "list" }, sessionKey: "global" });
  if (!res.ok) return { ok: false, error: res.error };

  // OpenClaw tool-call format often puts JSON as a string in result.result.content[0].text.
  const contentText = (res.result as any)?.result?.content?.[0]?.text;
  if (typeof contentText === "string" && contentText.trim()) {
    try {
      const parsed = JSON.parse(contentText);
      const jobs = Array.isArray(parsed?.jobs) ? parsed.jobs : [];
      return { ok: true, jobs };
    } catch {
      // fall through
    }
  }

  const jobs = (res.result as any)?.result?.jobs ?? (res.result as any)?.jobs;
  return { ok: true, jobs: Array.isArray(jobs) ? jobs : [] };
}

export async function createCronJob(job: Record<string, unknown>): Promise<{ ok: boolean; id?: string; error?: string }> {
  const res = await invokeGatewayTool({ tool: "cron", args: { action: "add", job }, sessionKey: "global" });
  if (!res.ok) return { ok: false, error: res.error };
  const id = (res.result as any)?.result?.id ?? (res.result as any)?.id;
  return { ok: true, id: typeof id === "string" ? id : undefined };
}

export async function removeCronJob(jobId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await invokeGatewayTool({ tool: "cron", args: { action: "remove", id: jobId }, sessionKey: "global" });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true };
}

export async function removeCronJobsByPrefix(prefix: string): Promise<void> {
  const list = await listCronJobs();
  if (!list.ok || !list.jobs) return;
  for (const job of list.jobs) {
    if (job.name.startsWith(prefix)) {
      await removeCronJob(job.id);
    }
  }
}
