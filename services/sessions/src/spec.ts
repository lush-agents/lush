export const sessionTypes = `
export type SessionMessageRole = "user" | "assistant" | "system" | "tool";

export type SessionThreadSummary = {
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
  threadId: string;
  role: SessionMessageRole;
  content: string;
  metadata: unknown;
  tokenCount: number | null;
  byteSize: number;
  createdAt: string;
};

export type SessionStateSnapshot = {
  id: string;
  threadId: string;
  kind: string;
  state: unknown;
  byteSize: number;
  createdAt: string;
};

export type SessionThread = SessionThreadSummary & {
  messages: SessionMessage[];
  stateSnapshots: SessionStateSnapshot[];
};

export type ListSessionThreadsResponse = {
  sessions: SessionThreadSummary[];
};

export type CreateSessionThreadRequest = {
  title?: string;
  agentId: string;
};

export type UpdateSessionThreadRequest = {
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

export type ArchiveSessionThreadRequest = Record<string, never>;

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
    id: "listSessionThreads",
    method: "GET",
    path: "/sessions",
    responseType: "ListSessionThreadsResponse",
    auth: true,
    kind: "json"
  },
  {
    id: "createSessionThread",
    method: "POST",
    path: "/sessions",
    requestType: "CreateSessionThreadRequest",
    responseType: "SessionThreadSummary",
    auth: true,
    kind: "json"
  },
  {
    id: "fetchSessionThread",
    method: "GET",
    path: "/sessions/:threadId",
    responseType: "SessionThread",
    auth: true,
    kind: "json"
  },
  {
    id: "updateSessionThread",
    method: "PATCH",
    path: "/sessions/:threadId",
    requestType: "UpdateSessionThreadRequest",
    responseType: "SessionThreadSummary",
    auth: true,
    kind: "json"
  },
  {
    id: "appendSessionMessage",
    method: "POST",
    path: "/sessions/:threadId/messages",
    requestType: "AppendSessionMessageRequest",
    responseType: "SessionMessage",
    auth: true,
    kind: "json"
  },
  {
    id: "appendSessionState",
    method: "POST",
    path: "/sessions/:threadId/state",
    requestType: "AppendSessionStateRequest",
    responseType: "SessionStateSnapshot",
    auth: true,
    kind: "json"
  },
  {
    id: "archiveSessionThread",
    method: "POST",
    path: "/sessions/:threadId/archive",
    requestType: "ArchiveSessionThreadRequest",
    responseType: "SessionThreadSummary",
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
