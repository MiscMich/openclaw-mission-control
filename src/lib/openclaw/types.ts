export type SpawnRequest = {
  agent: string;
  prompt: string;
  label?: string;
};

export type SpawnResponse = {
  sessionId: string;
  sessionKey: string;
  status: string;
  output?: string;
};

export type SessionInfo = {
  id: string;
  key: string;
  status: string;
  agent: string;
  startedAt: number;
  updatedAt: number;
  ageMs: number;
  model?: string;
  sessionId?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type SessionsListResponse = {
  sessions: SessionInfo[];
};

export type GatewayChatHistoryMessage = {
  role: string;
  content: unknown;
  timestamp?: number;
};

export type GatewayChatHistoryResponse = {
  sessionKey: string;
  sessionId?: string;
  messages: GatewayChatHistoryMessage[];
  thinkingLevel?: string;
  verboseLevel?: string;
};

export type GatewayChatSendResponse = {
  runId?: string;
  status?: string;
};
