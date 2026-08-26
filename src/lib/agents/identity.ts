export const AGENT_ID_ALIASES: Record<string, string> = {
  main: "coordinator",
};

export const REVERSE_AGENT_ID_ALIASES: Record<string, string> = {
  coordinator: "main",
};

export function canonicalAgentId(agentId: string): string {
  return AGENT_ID_ALIASES[agentId] ?? agentId;
}

export function openClawAgentStoreId(agentId: string): string {
  const canonicalId = canonicalAgentId(agentId);
  return REVERSE_AGENT_ID_ALIASES[canonicalId] ?? canonicalId;
}
