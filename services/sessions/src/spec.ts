export const sessionTypes = `
export type SessionMessageRole = "user" | "assistant" | "system" | "tool";

export type SessionSummary = {
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

export type Session = SessionSummary & {
  messages: SessionMessage[];
  stateSnapshots: SessionStateSnapshot[];
};

export type ListSessionsResponse = {
  sessions: SessionSummary[];
};

export type CreateSessionRequest = {
  title?: string;
  agentId: string;
};

export type UpdateSessionRequest = {
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

export type ArchiveSessionRequest = Record<string, never>;

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
    id: "listSessions",
    method: "GET",
    path: "/sessions",
    responseType: "ListSessionsResponse",
    auth: true,
    kind: "json"
  },
  {
    id: "createSession",
    method: "POST",
    path: "/sessions",
    requestType: "CreateSessionRequest",
    responseType: "SessionSummary",
    auth: true,
    kind: "json"
  },
  {
    id: "fetchSessionById",
    method: "GET",
    path: "/sessions/:sessionId",
    responseType: "Session",
    auth: true,
    kind: "json"
  },
  {
    id: "updateSession",
    method: "PATCH",
    path: "/sessions/:sessionId",
    requestType: "UpdateSessionRequest",
    responseType: "SessionSummary",
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
    id: "archiveSession",
    method: "POST",
    path: "/sessions/:sessionId/archive",
    requestType: "ArchiveSessionRequest",
    responseType: "SessionSummary",
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
