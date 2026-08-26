import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

const MAX_BODY_BYTES = 64 * 1024;

async function secureSecretEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let mismatch = left.length === right.length ? 0 : 1;
  for (let index = 0; index < a.length; index += 1) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}

async function isAuthorized(request: Request): Promise<boolean> {
  const configured = process.env.AGENT_API_KEY?.trim() ?? "";
  const supplied = request.headers.get("x-api-key") ?? "";
  return configured.length >= 32 && supplied.length > 0 && secureSecretEqual(supplied, configured);
}

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const configured = process.env.CONVEX_ALLOWED_ORIGIN?.trim();
  return Boolean(configured && origin === configured);
}

function secureHttpAction(handler: (ctx: any, request: Request) => Promise<Response>) {
  return httpAction(async (ctx, request) => {
    if (!isAllowedOrigin(request)) return errorResponse(request, 403, "Origin denied");
    if (request.method !== "OPTIONS" && !(await isAuthorized(request))) {
      return errorResponse(request, 401, "Unauthorized");
    }
    return handler(ctx, request);
  });
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  const configured = process.env.CONVEX_ALLOWED_ORIGIN?.trim();
  const allowedOrigin = origin && configured && origin === configured ? origin : undefined;

  return {
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-API-Key",
    "Access-Control-Max-Age": "86400",
    ...(origin != null ? { Vary: "Origin" } : {}),
  };
}

function jsonResponse(
  request: Request,
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> }
): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(request),
      ...(init?.headers ?? {}),
    },
  });
}

function errorResponse(request: Request, status: number, error: string): Response {
  return jsonResponse(request, { ok: false, error }, { status });
}

async function parseJsonBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("Content-Type") ?? "";
  const isJson = contentType.toLowerCase().includes("application/json");

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new Error("Request body is too large");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new Error("Request body is too large");
  }
  if (!text) return {};

  if (!isJson) {
    throw new Error("Expected application/json body");
  }

  const parsed = JSON.parse(text) as unknown;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }

  throw new Error("Expected JSON object body");
}

function pathnameAfterPrefix(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  return pathname.slice(prefix.length);
}

http.route({
  pathPrefix: "/api/",
  method: "OPTIONS",
  handler: secureHttpAction(async (_ctx, request) => {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }),
});

http.route({
  pathPrefix: "/api/tasks/assigned/",
  method: "GET",
  handler: secureHttpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const agentIdRaw = pathnameAfterPrefix(
        url.pathname,
        "/api/tasks/assigned/"
      );
      if (!agentIdRaw) return errorResponse(request, 404, "Not found");

      const agentId = decodeURIComponent(agentIdRaw);
      if (!agentId || agentId.includes("/")) {
        return errorResponse(request, 400, "Invalid agentId");
      }

      const result = await ctx.runQuery(api.tasks.list, { assigneeId: agentId });
      const filtered = result.tasks.filter(
        (t: any) => t.status === "assigned" || t.status === "in_progress"
      );
      return jsonResponse(request, filtered);
    } catch (err) {
      console.error("GET /api/tasks/assigned/* failed", err);
      return errorResponse(request, 500, "Internal error");
    }
  }),
});

http.route({
  pathPrefix: "/api/tasks/",
  method: "POST",
  handler: secureHttpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const rest = pathnameAfterPrefix(url.pathname, "/api/tasks/");
      if (!rest) return errorResponse(request, 404, "Not found");

      const [taskIdRaw, action, extra] = rest.split("/");
      if (!taskIdRaw || !action || extra) {
        return errorResponse(request, 404, "Not found");
      }

      const taskId = decodeURIComponent(taskIdRaw);
      if (!taskId) return errorResponse(request, 400, "Invalid taskId");

      if (action === "status") {
        const body = await parseJsonBody(request);
        const status = body?.status;
        const agentId = body?.agentId;
        const tokensUsed = body?.tokensUsed;
        const costUsd = body?.costUsd;
        const output = body?.output;

        if (typeof agentId !== "string" || !agentId) {
          return errorResponse(request, 400, "agentId is required");
        }
        if (
          status !== "in_progress" &&
          status !== "completed" &&
          status !== "failed" &&
          status !== "done"
        ) {
          return errorResponse(
            request,
            400,
            "status must be in_progress, completed, done, or failed"
          );
        }

        const task = await ctx.runQuery(api.tasks.getById, { id: taskId });
        if (!task) return errorResponse(request, 404, "Task not found");

        const normalizedTokensUsed =
          typeof tokensUsed === "number" ? tokensUsed : undefined;
        const normalizedCostUsd =
          typeof costUsd === "number" ? costUsd : undefined;
        const normalizedOutput = typeof output === "string" ? output : undefined;

        await ctx.runMutation(api.tasks.updateStatus, {
          id: taskId,
          status,
          tokensUsed: normalizedTokensUsed,
          costUsd: normalizedCostUsd,
          output: normalizedOutput,
        });

        if (normalizedTokensUsed !== undefined || normalizedCostUsd !== undefined) {
          await ctx.runMutation(api.agents.addUsage, {
            id: agentId,
            tokensUsed: normalizedTokensUsed,
            costUsd: normalizedCostUsd,
          });
        }

        await ctx.runMutation(api.activity.log, {
          type:
            status === "in_progress"
              ? "task_started"
              : status === "done" || status === "completed"
                ? "task_completed"
                : "task_failed",
          message: `Task ${status}: ${task.title}`,
          agentId,
          taskId,
        });

        return jsonResponse(request, { ok: true });
      }

      if (action === "comment") {
        const body = await parseJsonBody(request);
        const authorId = body?.authorId;
        const authorName = body?.authorName;
        const content = body?.content;
        const mentions = body?.mentions;
        const attachments = body?.attachments;

        if (typeof authorId !== "string" || !authorId) {
          return errorResponse(request, 400, "authorId is required");
        }
        if (typeof authorName !== "string" || !authorName) {
          return errorResponse(request, 400, "authorName is required");
        }
        if (typeof content !== "string" || !content.trim()) {
          return errorResponse(request, 400, "content is required");
        }

        await ctx.runMutation(api.comments.create, {
          taskId,
          authorId,
          authorName,
          content,
          mentions: Array.isArray(mentions) ? mentions : undefined,
          attachments: Array.isArray(attachments) ? attachments : undefined,
        });

        return jsonResponse(request, { ok: true });
      }

      if (action === "session") {
        const body = await parseJsonBody(request);
        const sessionKey = body?.sessionKey;

        if (typeof sessionKey !== "string" || !sessionKey) {
          return errorResponse(request, 400, "sessionKey is required");
        }

        const task = await ctx.runQuery(api.tasks.getById, { id: taskId });
        if (!task) return errorResponse(request, 404, "Task not found");

        await ctx.runMutation(api.tasks.setSessionKey, {
          id: taskId,
          sessionKey,
        });

        return jsonResponse(request, { ok: true });
      }

      if (action === "delete") {
        const task = await ctx.runQuery(api.tasks.getById, { id: taskId });
        if (!task) return errorResponse(request, 404, "Task not found");

        await ctx.runMutation(api.tasks.deleteTask, { id: taskId });
        return jsonResponse(request, { ok: true, deleted: taskId });
      }

      return errorResponse(request, 404, "Not found");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("Expected application/json body")) {
        return errorResponse(request, 400, message);
      }
      console.error("POST /api/tasks/* failed", err);
      return errorResponse(request, 500, "Internal error");
    }
  }),
});

http.route({
  pathPrefix: "/api/agents/",
  method: "POST",
  handler: secureHttpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const rest = pathnameAfterPrefix(url.pathname, "/api/agents/");
      if (!rest) return errorResponse(request, 404, "Not found");

      const [agentIdRaw, action, extra] = rest.split("/");
      if (!agentIdRaw || action !== "heartbeat" || extra) {
        return errorResponse(request, 404, "Not found");
      }

      const agentId = decodeURIComponent(agentIdRaw);
      if (!agentId) return errorResponse(request, 400, "Invalid agentId");

      const body = await parseJsonBody(request);
      const status = body?.status;
      const currentTaskId = body?.currentTaskId;

      if (status !== undefined && status !== "idle" && status !== "working") {
        return errorResponse(request, 400, "status must be idle or working");
      }
      if (currentTaskId !== undefined && typeof currentTaskId !== "string") {
        return errorResponse(request, 400, "currentTaskId must be a string");
      }

      await ctx.runMutation(api.agents.updateLastSeen, { id: agentId });

      const shouldUpdateStatusOrTask =
        status !== undefined || currentTaskId !== undefined;
      if (shouldUpdateStatusOrTask) {
        const derivedStatus =
          status ?? (typeof currentTaskId === "string" && currentTaskId ? "working" : "idle");

        await ctx.runMutation(api.agents.updateStatus, {
          id: agentId,
          status: derivedStatus,
          ...(currentTaskId !== undefined ? { currentTaskId } : {}),
        });
      }

      const tasks = await ctx.runQuery(api.tasks.list, { assigneeId: agentId });
      const notifications = await ctx.runQuery(api.notifications.listUndelivered, { agentId });
      
      // Include recent messages for/to this agent (agent-to-agent collaboration)
      const messages = await ctx.runQuery(api.agentMessages.list, { agentId, limit: 20 });

      return jsonResponse(request, { ok: true, tasks, notifications, messages });
    } catch (err) {
      console.error("POST /api/agents/* failed", err);
      return errorResponse(request, 500, "Internal error");
    }
  }),
});

http.route({
  path: "/api/activity/recent",
  method: "GET",
  handler: secureHttpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const limitRaw = url.searchParams.get("limit");
      const parsedLimit =
        limitRaw == null || limitRaw === "" ? 20 : Number.parseInt(limitRaw, 10);
      const limit =
        Number.isFinite(parsedLimit) && parsedLimit > 0
          ? Math.min(parsedLimit, 100)
          : 20;

      const items = await ctx.runQuery(api.activity.listRecent, { limit });
      return jsonResponse(request, items);
    } catch (err) {
      console.error("GET /api/activity/recent failed", err);
      return errorResponse(request, 500, "Internal error");
    }
  }),
});

http.route({
  pathPrefix: "/api/notifications/undelivered/",
  method: "GET",
  handler: secureHttpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const agentIdRaw = pathnameAfterPrefix(
        url.pathname,
        "/api/notifications/undelivered/"
      );
      if (!agentIdRaw) return errorResponse(request, 404, "Not found");
      const agentId = decodeURIComponent(agentIdRaw);
      const notifications = await ctx.runQuery(api.notifications.listUndelivered, { agentId });
      return jsonResponse(request, notifications);
    } catch (err) {
      console.error("GET /api/notifications/undelivered failed", err);
      return errorResponse(request, 500, "Internal error");
    }
  }),
});

http.route({
  pathPrefix: "/api/notifications/",
  method: "POST",
  handler: secureHttpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const rest = pathnameAfterPrefix(url.pathname, "/api/notifications/");
      if (!rest) return errorResponse(request, 404, "Not found");
      const [notificationIdRaw, action, extra] = rest.split("/");
      if (!notificationIdRaw || action !== "delivered" || extra) {
        return errorResponse(request, 404, "Not found");
      }
      const notificationId = decodeURIComponent(notificationIdRaw);
      await ctx.runMutation(api.notifications.markDelivered, { id: notificationId });
      return jsonResponse(request, { ok: true });
    } catch (err) {
      console.error("POST /api/notifications/* failed", err);
      return errorResponse(request, 500, "Internal error");
    }
  }),
});

http.route({
  pathPrefix: "/api/documents/",
  method: "POST",
  handler: secureHttpAction(async (ctx, request) => {
    try {
      const body = await parseJsonBody(request);
      const title = body?.title;
      const content = body?.content;
      const type = body?.type;
      const taskId = body?.taskId;
      const createdBy = body?.createdBy;

      if (typeof title !== "string" || !title) {
        return errorResponse(request, 400, "title is required");
      }
      if (typeof content !== "string") {
        return errorResponse(request, 400, "content is required");
      }
      if (typeof type !== "string" || !type) {
        return errorResponse(request, 400, "type is required");
      }
      if (typeof createdBy !== "string" || !createdBy) {
        return errorResponse(request, 400, "createdBy is required");
      }

      const result = await ctx.runMutation(api.documents.create, {
        title,
        content,
        type,
        taskId: typeof taskId === "string" ? taskId : undefined,
        createdBy,
      });

      return jsonResponse(request, { ok: true, id: result.id });
    } catch (err) {
      console.error("POST /api/documents failed", err);
      return errorResponse(request, 500, "Internal error");
    }
  }),
});

http.route({
  pathPrefix: "/api/documents/byTask/",
  method: "GET",
  handler: secureHttpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const taskIdRaw = pathnameAfterPrefix(url.pathname, "/api/documents/byTask/");
      if (!taskIdRaw) return errorResponse(request, 404, "Not found");
      const taskId = decodeURIComponent(taskIdRaw);
      const docs = await ctx.runQuery(api.documents.listByTask, { taskId });
      return jsonResponse(request, docs);
    } catch (err) {
      console.error("GET /api/documents/byTask failed", err);
      return errorResponse(request, 500, "Internal error");
    }
  }),
});

/**
 * Sync REAL usage data from OpenClaw session files
 * POST /api/agents/sync
 * Body: { usageData: [{ agentId, totalCost, totalTokens, lastActivity? }], activeAgents?: [{ agentId, activeSessions, lastActivity }] }
 */
http.route({
  path: "/api/agents/sync",
  method: "POST",
  handler: secureHttpAction(async (ctx, request) => {
    try {
      const body = await parseJsonBody(request);
      const usageData = body?.usageData;
      const activeAgents = body?.activeAgents;

      if (!Array.isArray(usageData)) {
        return errorResponse(request, 400, "usageData array is required");
      }

      // Validate and normalize usage data
      const normalizedUsage = usageData.map((entry: unknown) => {
        const d = entry as {
          agentId?: unknown;
          totalCost?: unknown;
          totalTokens?: unknown;
          todayCost?: unknown;
          todayTokens?: unknown;
          usageSyncedAt?: unknown;
          lastActivity?: unknown;
        };
        return {
          agentId: String(d.agentId ?? ""),
          totalCost: typeof d.totalCost === "number" ? d.totalCost : 0,
          totalTokens: typeof d.totalTokens === "number" ? d.totalTokens : 0,
          todayCost: typeof d.todayCost === "number" ? d.todayCost : 0,
          todayTokens: typeof d.todayTokens === "number" ? d.todayTokens : 0,
          usageSyncedAt:
            typeof d.usageSyncedAt === "number" ? d.usageSyncedAt : Date.now(),
          lastActivity: typeof d.lastActivity === "number" ? d.lastActivity : undefined,
        };
      });

      // Sync usage data
      const usageResult = await ctx.runMutation(api.agents.syncUsage, {
        usageData: normalizedUsage,
      });

      // Optionally sync status if activeAgents provided
      let statusResult = null;
      if (Array.isArray(activeAgents)) {
        const normalizedActive = activeAgents.map((entry: unknown) => {
          const a = entry as {
            agentId?: unknown;
            activeSessions?: unknown;
            lastActivity?: unknown;
          };
          return {
            agentId: String(a.agentId ?? ""),
            activeSessions: typeof a.activeSessions === "number" ? a.activeSessions : 1,
            lastActivity: typeof a.lastActivity === "number" ? a.lastActivity : Date.now(),
          };
        });
        
        statusResult = await ctx.runMutation(api.agents.syncStatus, {
          activeAgents: normalizedActive,
        });
      }

      return jsonResponse(request, {
        success: true,
        agentsUpdated: usageResult.updated,
        agentsCreated: usageResult.created,
        activeAgents: statusResult?.activeAgents ?? 0,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("Expected application/json body")) {
        return errorResponse(request, 400, message);
      }
      console.error("POST /api/agents/sync failed", err);
      return errorResponse(request, 500, "Internal error");
    }
  }),
});

/**
 * Log activity events
 * POST /api/activity
 * Body: { type, message, agentId?, taskId? }
 */
http.route({
  path: "/api/activity",
  method: "POST",
  handler: secureHttpAction(async (ctx, request) => {
    try {
      const body = await parseJsonBody(request);
      const type = body?.type;
      const message = body?.message;
      const agentId = body?.agentId;
      const taskId = body?.taskId;

      if (typeof type !== "string" || !type) {
        return errorResponse(request, 400, "type is required");
      }
      if (typeof message !== "string" || !message) {
        return errorResponse(request, 400, "message is required");
      }

      await ctx.runMutation(api.activity.log, {
        type,
        message,
        agentId: typeof agentId === "string" ? agentId : undefined,
        taskId: typeof taskId === "string" ? taskId : undefined,
      });

      return jsonResponse(request, { ok: true });
    } catch (err: unknown) {
      console.error("POST /api/activity failed", err);
      return errorResponse(request, 500, "Internal error");
    }
  }),
});

/**
 * Create a new task (for agent autonomy)
 * POST /api/tasks
 * Body: { title, description?, priority?, createdBy, assigneeId?, suggestedAssignee?, sessionKey? }
 */
http.route({
  path: "/api/tasks",
  method: "POST",
  handler: secureHttpAction(async (ctx, request) => {
    try {
      const body = await parseJsonBody(request);
      const title = body?.title;
      const description = body?.description;
      const priorityRaw = body?.priority;
      const priority: "low" | "normal" | "high" | "urgent" =
        priorityRaw === "low" ||
        priorityRaw === "normal" ||
        priorityRaw === "high" ||
        priorityRaw === "urgent"
          ? priorityRaw
          : "normal";
      const createdBy = body?.createdBy;
      const assigneeId = body?.assigneeId;
      const suggestedAssignee = body?.suggestedAssignee;
      const sessionKey = body?.sessionKey;

      if (typeof title !== "string" || !title) {
        return errorResponse(request, 400, "title is required");
      }
      if (typeof createdBy !== "string" || !createdBy) {
        return errorResponse(request, 400, "createdBy is required");
      }

      const result = await ctx.runMutation(api.tasks.create, {
        title,
        description: typeof description === "string" ? description : undefined,
        priority,
        createdBy,
        assigneeId: typeof assigneeId === "string" ? assigneeId : undefined,
        suggestedAssignee: typeof suggestedAssignee === "string" ? suggestedAssignee : undefined,
        sessionKey: typeof sessionKey === "string" ? sessionKey : undefined,
      });

      // Log activity
      await ctx.runMutation(api.activity.log, {
        type: "task_created",
        message: `Created task: ${title}`,
        agentId: createdBy,
        taskId: result.id,
      });

      return jsonResponse(request, { ok: true, id: result.id });
    } catch (err: unknown) {
      console.error("POST /api/tasks failed", err);
      return errorResponse(request, 500, "Internal error");
    }
  }),
});

/**
 * Claim an unassigned task (for agent autonomy)
 * POST /api/tasks/claim
 * Body: { taskId, agentId }
 */
http.route({
  path: "/api/tasks/claim",
  method: "POST",
  handler: secureHttpAction(async (ctx, request) => {
    try {
      const body = await parseJsonBody(request);
      const taskId = body?.taskId;
      const agentId = body?.agentId;

      if (typeof taskId !== "string" || !taskId) {
        return errorResponse(request, 400, "taskId is required");
      }
      if (typeof agentId !== "string" || !agentId) {
        return errorResponse(request, 400, "agentId is required");
      }

      const task = await ctx.runQuery(api.tasks.getById, { id: taskId });
      if (!task) {
        return errorResponse(request, 404, "Task not found");
      }
      if (task.assigneeId && task.assigneeId !== agentId) {
        return errorResponse(request, 409, "Task already assigned to another agent");
      }

      await ctx.runMutation(api.tasks.assign, { id: taskId, assigneeId: agentId });

      // Log activity
      await ctx.runMutation(api.activity.log, {
        type: "task_claimed",
        message: `${agentId.toUpperCase()} claimed: ${task.title}`,
        agentId,
        taskId,
      });

      return jsonResponse(request, { ok: true });
    } catch (err: unknown) {
      console.error("POST /api/tasks/claim failed", err);
      return errorResponse(request, 500, "Internal error");
    }
  }),
});

/**
 * List open/unassigned tasks (for agent autonomy)
 * GET /api/tasks/open
 */
http.route({
  path: "/api/tasks/open",
  method: "GET",
  handler: secureHttpAction(async (ctx, request) => {
    try {
      const result = await ctx.runQuery(api.tasks.list, {});
      const open = result.tasks.filter((t: any) => t.status === "open" && !t.assigneeId);
      return jsonResponse(request, open);
    } catch (err) {
      console.error("GET /api/tasks/open failed", err);
      return errorResponse(request, 500, "Internal error");
    }
  }),
});

/**
 * Create or get daily standup
 * POST /api/standups - create with { date, summary }
 * GET /api/standups - get latest
 * GET /api/standups/generate?date=YYYY-MM-DD - auto-generate
 */
http.route({
  path: "/api/standups",
  method: "POST",
  handler: secureHttpAction(async (ctx, request) => {
    try {
      const body = await parseJsonBody(request);
      const date = body?.date;
      const summary = body?.summary;

      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return errorResponse(request, 400, "date must be YYYY-MM-DD format");
      }
      if (typeof summary !== "string" || !summary) {
        return errorResponse(request, 400, "summary is required");
      }

      const result = await ctx.runMutation(api.standups.create, { date, summary });
      return jsonResponse(request, { ok: true, id: result.id });
    } catch (err) {
      console.error("POST /api/standups failed", err);
      return errorResponse(request, 500, "Internal error");
    }
  }),
});

http.route({
  path: "/api/standups",
  method: "GET",
  handler: secureHttpAction(async (ctx, request) => {
    try {
      const standup = await ctx.runQuery(api.standups.latest, {});
      return jsonResponse(request, standup);
    } catch (err) {
      console.error("GET /api/standups failed", err);
      return errorResponse(request, 500, "Internal error");
    }
  }),
});

http.route({
  path: "/api/standups/generate",
  method: "POST",
  handler: secureHttpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const date = url.searchParams.get("date") ?? undefined;
      
      const result = await ctx.runMutation(api.standups.generateDaily, { date });
      return jsonResponse(request, { ok: true, ...result });
    } catch (err) {
      console.error("POST /api/standups/generate failed", err);
      return errorResponse(request, 500, "Internal error");
    }
  }),
});

/**
 * Agent-to-Agent Messaging
 * POST /api/messages - send a message { fromAgentId, toAgentId?, content, mentions?, taskId? }
 * GET /api/messages - list messages (optional: ?agentId=xxx&limit=50)
 */
http.route({
  path: "/api/messages",
  method: "POST",
  handler: secureHttpAction(async (ctx, request) => {
    try {
      const body = await parseJsonBody(request);
      const fromAgentId = body?.fromAgentId;
      const toAgentId = body?.toAgentId;
      const content = body?.content;
      const mentions = body?.mentions;
      const taskId = body?.taskId;

      if (typeof fromAgentId !== "string" || !fromAgentId) {
        return errorResponse(request, 400, "fromAgentId is required");
      }
      if (typeof content !== "string" || !content.trim()) {
        return errorResponse(request, 400, "content is required");
      }

      const result = await ctx.runMutation(api.agentMessages.send, {
        fromAgentId,
        toAgentId: typeof toAgentId === "string" ? toAgentId : undefined,
        content,
        mentions: Array.isArray(mentions) ? mentions : undefined,
        taskId: typeof taskId === "string" ? taskId : undefined,
      });

      return jsonResponse(request, { ok: true, id: result.id });
    } catch (err) {
      console.error("POST /api/messages failed", err);
      return errorResponse(request, 500, "Internal error");
    }
  }),
});

http.route({
  path: "/api/messages",
  method: "GET",
  handler: secureHttpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const agentId = url.searchParams.get("agentId") ?? undefined;
      const limitRaw = url.searchParams.get("limit");
      const limit = limitRaw ? parseInt(limitRaw, 10) : 50;

      const messages = await ctx.runQuery(api.agentMessages.list, {
        agentId,
        limit: Math.min(limit, 100),
      });

      return jsonResponse(request, messages);
    } catch (err) {
      console.error("GET /api/messages failed", err);
      return errorResponse(request, 500, "Internal error");
    }
  }),
});

/**
 * Get messages between two specific agents (thread)
 * GET /api/messages/thread?agent1=xxx&agent2=yyy
 */
http.route({
  path: "/api/messages/thread",
  method: "GET",
  handler: secureHttpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const agent1 = url.searchParams.get("agent1");
      const agent2 = url.searchParams.get("agent2");

      if (!agent1 || !agent2) {
        return errorResponse(request, 400, "agent1 and agent2 are required");
      }

      const messages = await ctx.runQuery(api.agentMessages.getThread, {
        agentId1: agent1,
        agentId2: agent2,
      });

      return jsonResponse(request, messages);
    } catch (err) {
      console.error("GET /api/messages/thread failed", err);
      return errorResponse(request, 500, "Internal error");
    }
  }),
});

export default http;
