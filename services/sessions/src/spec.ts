export const sessionTypes = `
export type SessionMessageRole = "user" | "assistant" | "system" | "tool";

export type SessionSummary = {
  id: string;
  organizationId: string;
  ownerUserId: string;
  title: string;
  agentId: string;
  projectId: string | null;
  pinnedAt: string | null;
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
  projectId?: string | null;
};

export type UpdateSessionRequest = {
  title?: string;
  projectId?: string | null;
  pinned?: boolean;
};

export type ProjectSummary = {
  id: string;
  organizationId: string;
  ownerUserId: string;
  name: string;
  instructions: string;
  memory: string;
  pinnedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectContextItem = {
  id: string;
  projectId: string;
  filename: string;
  mediaType: string;
  content: string;
  byteSize: number;
  createdAt: string;
};

export type Project = ProjectSummary & {
  contextItems: ProjectContextItem[];
};

export type ListProjectsResponse = {
  projects: ProjectSummary[];
};

export type CreateProjectRequest = {
  name: string;
};

export type UpdateProjectRequest = {
  name?: string;
  instructions?: string;
  memory?: string;
  pinned?: boolean;
};

export type DeleteProjectRequest = Record<string, never>;

export type AddProjectContextRequest = {
  filename: string;
  mediaType: string;
  content: string;
};

export type DeleteProjectContextRequest = Record<string, never>;

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

export type TruncateSessionRequest = {
  afterMessageId: string | null;
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
    id: "listProjects",
    method: "GET",
    path: "/projects",
    responseType: "ListProjectsResponse",
    auth: true,
    kind: "json"
  },
  {
    id: "createProject",
    method: "POST",
    path: "/projects",
    requestType: "CreateProjectRequest",
    responseType: "Project",
    auth: true,
    kind: "json"
  },
  {
    id: "fetchProjectById",
    method: "GET",
    path: "/projects/:projectId",
    responseType: "Project",
    auth: true,
    kind: "json"
  },
  {
    id: "updateProject",
    method: "PATCH",
    path: "/projects/:projectId",
    requestType: "UpdateProjectRequest",
    responseType: "Project",
    auth: true,
    kind: "json"
  },
  {
    id: "deleteProject",
    method: "POST",
    path: "/projects/:projectId/delete",
    requestType: "DeleteProjectRequest",
    responseType: "ProjectSummary",
    auth: true,
    kind: "json"
  },
  {
    id: "addProjectContext",
    method: "POST",
    path: "/projects/:projectId/context",
    requestType: "AddProjectContextRequest",
    responseType: "ProjectContextItem",
    auth: true,
    kind: "json"
  },
  {
    id: "deleteProjectContext",
    method: "POST",
    path: "/projects/:projectId/context/:contextId/delete",
    requestType: "DeleteProjectContextRequest",
    responseType: "Project",
    auth: true,
    kind: "json"
  },
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
    id: "truncateSession",
    method: "POST",
    path: "/sessions/:sessionId/truncate",
    requestType: "TruncateSessionRequest",
    responseType: "Session",
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
