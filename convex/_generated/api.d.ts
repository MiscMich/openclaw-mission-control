/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as agentMessages from "../agentMessages.js";
import type * as agentSettings from "../agentSettings.js";
import type * as agents from "../agents.js";
import type * as comments from "../comments.js";
import type * as documents from "../documents.js";
import type * as http from "../http.js";
import type * as notifications from "../notifications.js";
import type * as seed from "../seed.js";
import type * as settings from "../settings.js";
import type * as standups from "../standups.js";
import type * as taskSubscriptions from "../taskSubscriptions.js";
import type * as tasks from "../tasks.js";
import type * as terminalLogs from "../terminalLogs.js";
import type * as workflowOutput from "../workflowOutput.js";
import type * as workflowToolPolicy from "../workflowToolPolicy.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  agentMessages: typeof agentMessages;
  agentSettings: typeof agentSettings;
  agents: typeof agents;
  comments: typeof comments;
  documents: typeof documents;
  http: typeof http;
  notifications: typeof notifications;
  seed: typeof seed;
  settings: typeof settings;
  standups: typeof standups;
  taskSubscriptions: typeof taskSubscriptions;
  tasks: typeof tasks;
  terminalLogs: typeof terminalLogs;
  workflowOutput: typeof workflowOutput;
  workflowToolPolicy: typeof workflowToolPolicy;
  workflows: typeof workflows;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
