export type SafeSystemControlTarget = "workers" | "bridge";
export type SafeSystemControlAction = "start" | "stop" | "restart";

export type SafeSystemControlCommand = {
  target: SafeSystemControlTarget;
  action: SafeSystemControlAction;
};

export function parseSystemControlCommand(payload: unknown): SafeSystemControlCommand {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid control request");
  }
  const record = payload as Record<string, unknown>;
  const target = typeof record.target === "string" ? record.target.trim() : "";
  const action = typeof record.action === "string" ? record.action.trim() : "";
  if (target !== "workers" && target !== "bridge") {
    throw new Error("Invalid or unsupported control target");
  }
  if (action !== "start" && action !== "stop" && action !== "restart") {
    throw new Error("Invalid or unsupported control action");
  }
  return { target, action };
}
