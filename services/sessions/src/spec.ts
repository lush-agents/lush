export const sessionTypes = `
export type SessionMessageRole = "user" | "assistant" | "system" | "tool";

export type AgentSessionSummary = {
  id: string;
  organizationId: string;
  ownerUserId: string;
  title: string;
  agentId: string;
  stateBytes: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type SessionMessage = {
  id: string;
  sessionId: string;
  role: SessionMessageRole;
  content: string;
  metadata: unknown;
  tokenCount: number | null;
  byteSize: number;
  createdAt: string;
};

export type SessionStateSnapshot = {
  id: string;
  sessionId: string;
  kind: string;
  state: unknown;
  byteSize: number;
  createdAt: string;
};

export type AgentSession = AgentSessionSummary & {
  messages: SessionMessage[];
  stateSnapshots: SessionStateSnapshot[];
};

export type ListAgentSessionsResponse = {
  sessions: AgentSessionSummary[];
};

export type CreateAgentSessionRequest = {
  title?: string;
  agentId: string;
};

export type UpdateAgentSessionRequest = {
  title?: string;
};

export type AppendSessionMessageRequest = {
  role: SessionMessageRole;
  content: string;
  metadata?: unknown;
  tokenCount?: number | null;
};

export type AppendSessionStateRequest = {
  kind: string;
  state: unknown;
};

export type ArchiveAgentSessionRequest = Record<string, never>;

export type SessionSettings = {
  organizationId: string;
  retentionSeconds: number;
  createdAt: string;
  updatedAt: string;
};

export type UpdateSessionSettingsRequest = {
  retentionSeconds: number;
};
`;

export const sessionRoutes = [
  {
    id: "listAgentSessions",
    method: "GET",
    path: "/sessions",
    responseType: "ListAgentSessionsResponse",
    auth: true,
    kind: "json"
  },
  {
    id: "createAgentSession",
    method: "POST",
    path: "/sessions",
    requestType: "CreateAgentSessionRequest",
    responseType: "AgentSessionSummary",
    auth: true,
    kind: "json"
  },
  {
    id: "fetchAgentSession",
    method: "GET",
    path: "/sessions/:sessionId",
    responseType: "AgentSession",
    auth: true,
    kind: "json"
  },
  {
    id: "updateAgentSession",
    method: "PATCH",
    path: "/sessions/:sessionId",
    requestType: "UpdateAgentSessionRequest",
    responseType: "AgentSessionSummary",
    auth: true,
    kind: "json"
  },
  {
    id: "appendSessionMessage",
    method: "POST",
    path: "/sessions/:sessionId/messages",
    requestType: "AppendSessionMessageRequest",
    responseType: "SessionMessage",
    auth: true,
    kind: "json"
  },
  {
    id: "appendSessionState",
    method: "POST",
    path: "/sessions/:sessionId/state",
    requestType: "AppendSessionStateRequest",
    responseType: "SessionStateSnapshot",
    auth: true,
    kind: "json"
  },
  {
    id: "archiveAgentSession",
    method: "POST",
    path: "/sessions/:sessionId/archive",
    requestType: "ArchiveAgentSessionRequest",
    responseType: "AgentSessionSummary",
    auth: true,
    kind: "json"
  },
  {
    id: "fetchSessionSettings",
    method: "GET",
    path: "/settings/sessions",
    responseType: "SessionSettings",
    auth: true,
    kind: "json"
  },
  {
    id: "updateSessionSettings",
    method: "PATCH",
    path: "/settings/sessions",
    requestType: "UpdateSessionSettingsRequest",
    responseType: "SessionSettings",
    auth: true,
    kind: "json"
  }
] as const;

export type SessionRoute = (typeof sessionRoutes)[number];
