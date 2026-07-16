import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  type AgentChatMessage,
  type ProjectAgentContext,
  getLushAgentMetadata,
  streamLushAgentChat
} from "@lush/agent/runtime";
import {
  SessionContextError,
  loadLushSessionContext,
  mergeSessionMessages
} from "@lush/agent/session-context";
import { normalizeAgentChatMessages } from "@lush/agent/chat-request";
import {
  agentStreamContentType,
  agentTextEventStream,
  encodeAgentStreamEvent
} from "@lush/agent/stream-protocol";
import {
  AuthError,
  type AuthzAction,
  authorizePrincipal,
  bearerToken,
  createOrganization,
  createOrganizationInvite,
  deleteCurrentOrganization,
  listOrganizationInvites,
  listOrganizationMembers,
  listOrganizations,
  login,
  type Principal,
  refreshAccessSession,
  registerAccount,
  removeOrganizationMember,
  resolveAccessPrincipal,
  resolveRefreshSession,
  revokeSession,
  revokeUserSessions,
  switchOrganization,
  updateCurrentOrganization,
  updateOrganizationMemberRole,
  updateCurrentUser
} from "@lush/authz/runtime";
import {
  createInferenceProvider,
  deleteInferenceProvider,
  getInferenceConfig,
  InferenceError,
  updateInferenceModelDefault,
  updateInferenceModel,
  updateInferenceProvider
} from "@lush/inference/runtime";
import {
  appendSessionMessage,
  appendSessionState,
  addProjectContext,
  archiveSession,
  createProject,
  createSession,
  deleteProject,
  deleteProjectContext,
  fetchProject,
  fetchSessionSettings,
  fetchSession,
  listProjects,
  listSessions,
  SessionStateError,
  truncateSession,
  updateProject,
  updateSessionSettings,
  updateSession
} from "@lush/sessions/runtime";
import {
  ConfigError,
  envSchema,
  readEnvSchema
} from "@lush/config/env";
import { createLogger } from "@lush/logging/logger";
import {
  ClientEventBroker,
  type AuthRefreshReason,
  type ClientEvent,
  type ClientEventScope
} from "./client-events";
import { apiSpec } from "./spec";
import {
  buildRequestLogMeta,
  compileRequestLogRoutes,
  type RequestLogRoute
} from "./request-log";

const apiConfig = readApiRuntimeConfig();
const port = apiConfig.port;
const hostname = apiConfig.hostname;
const logger = createLogger("@lush/api");
const app = new Hono();
const sessionCookieName = "lush_session";
const clientEvents = new ClientEventBroker();
type ApiRouteId = (typeof apiSpec.routes)[number]["id"];
type OrganizationPrincipal = Principal & {
  organizationId: string;
  membershipId: string;
  role: NonNullable<Principal["role"]>;
};
const routePaths = new Map<ApiRouteId, `/${string}`>();
for (const route of apiSpec.routes) {
  routePaths.set(route.id, route.path);
}

const requestLogRoutes = compileRequestLogRoutes([
  { id: "health", method: "GET", path: "/health" },
  { id: "apiHealth", method: "GET", path: apiSpec.healthPath },
  ...apiSpec.routes.map((route) => ({
    id: route.id,
    method: route.method,
    path: route.path
  }))
] satisfies RequestLogRoute[]);
const contentfulStatusCodes = new Set<number>([
  200, 201, 202, 203, 206, 207, 208, 226,
  300, 301, 302, 303, 305, 306, 307, 308,
  400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411,
  412, 413, 414, 415, 416, 417, 418, 421, 422, 423, 424, 425,
  426, 428, 429, 431, 451,
  500, 501, 502, 503, 504, 505, 506, 507, 508, 510, 511
]);

const desktopAppOrigins = [
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost"
];
const allowedOrigins = Array.from(
  new Set([...apiConfig.appOrigins, ...desktopAppOrigins])
);

app.use("*", async (c, next) => {
  const start = performance.now();
  const requestId = c.req.raw.headers.get("x-request-id") ?? crypto.randomUUID();
  let thrownError: unknown;

  c.header("x-request-id", requestId);

  try {
    await next();
  } catch (error) {
    thrownError = error;
    throw error;
  } finally {
    const meta = buildRequestLogMeta(c.req.raw, {
      routes: requestLogRoutes,
      statusCode: thrownError ? 500 : c.res.status,
      durationMs: Number((performance.now() - start).toFixed(2)),
      requestId,
      response: thrownError ? undefined : c.res
    });

    if (thrownError) {
      logger.error({ ...meta, err: thrownError }, "api request failed");
    } else {
      logger.debug(meta, "api request");
    }
  }
});

app.use(
  "*",
  cors({
    origin: allowedOrigins,
    allowHeaders: ["authorization", "content-type"],
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
    credentials: true,
    maxAge: 86400
  })
);

app.get("/health", (c) => c.json(healthResponse()));
app.get(apiSpec.healthPath, (c) => c.json(healthResponse()));

function healthResponse() {
  return {
    ok: true,
    service: "@lush/api",
    agent: getLushAgentMetadata().id,
    routes: apiSpec.routes.map((route) => ({
      id: route.id,
      method: route.method,
      path: route.path
    }))
  };
}

function routePath(id: ApiRouteId) {
  const path = routePaths.get(id);
  if (!path) {
    throw new Error(`Missing API route path for ${id}`);
  }

  return path;
}

function sessionIdParam(c: Context) {
  return c.req.param("sessionId") ?? "";
}

function projectIdParam(c: Context) {
  return c.req.param("projectId") ?? "";
}

function contextIdParam(c: Context) {
  return c.req.param("contextId") ?? "";
}

app.post(routePath("registerAccount"), async (c) => {
  try {
    const body = await c.req.json().catch(() => undefined);
    return c.json(await registerAccount(body, requestMeta(c.req.raw)));
  } catch (error) {
    return handleAuthError(c, error, "Unable to register");
  }
});

app.post(routePath("login"), async (c) => {
  try {
    const body = await c.req.json().catch(() => undefined);
    const session = await login(body, requestMeta(c.req.raw));
    const { refreshToken, ...response } = session;
    setSessionCookie(c, refreshToken, response.session.expiresAt, c.req.raw);
    return c.json(response);
  } catch (error) {
    return handleAuthError(c, error, "Unable to log in");
  }
});

app.post(routePath("refreshSession"), async (c) => {
  try {
    const refreshToken = sessionCookie(c.req.raw);
    if (!refreshToken) {
      return unauthorized(c);
    }

    const session = await refreshAccessSession(
      refreshToken,
      requestMeta(c.req.raw)
    );
    const { refreshToken: nextRefreshToken, ...response } = session;
    setSessionCookie(
      c,
      nextRefreshToken,
      response.session.expiresAt,
      c.req.raw
    );
    return c.json(response);
  } catch (error) {
    return handleAuthError(c, error, "Unable to refresh session");
  }
});

app.post(routePath("logout"), async (c) => {
  const auth =
    (await authenticateAccess(c.req.raw)) ??
    (await authenticateRefresh(c.req.raw));
  clearSessionCookie(c, c.req.raw);

  if (auth) {
    try {
      authorizePrincipal(auth.principal, "logout");
    } catch (error) {
      return handleAuthError(c, error, "Not authorized");
    }
    return c.json(await revokeSession(auth.principal));
  }

  return c.json({ ok: true as const });
});

app.post(routePath("logoutAllSessions"), async (c) => {
  const authorized = await authenticateAuthorized(c, "logoutAllSessions");
  clearSessionCookie(c, c.req.raw);
  if ("response" in authorized) {
    return authorized.response;
  }

  const response = await revokeUserSessions(authorized.auth.principal);
  publishAuthRefresh(
    { userId: authorized.auth.principal.userId },
    "session_revoked"
  );
  return c.json(response);
});

app.get(routePath("fetchSession"), async (c) => {
  const authorized = await authenticateAuthorized(c, "fetchSession");
  if ("response" in authorized) {
    return authorized.response;
  }

  return c.json(authorized.auth.session);
});

app.get(routePath("openClientEvents"), async (c) => {
  const authorized = await authenticateAuthorized(c, "openClientEvents");
  if ("response" in authorized) {
    return authorized.response;
  }

  return streamClientEvents(c.req.raw, authorized.auth.principal);
});

app.get(routePath("listOrganizations"), async (c) => {
  const authorized = await authenticateAuthorized(c, "listOrganizations");
  if ("response" in authorized) {
    return authorized.response;
  }

  return c.json(await listOrganizations(authorized.auth.principal));
});

app.post(routePath("switchOrganization"), async (c) => {
  const authorized = await authenticateAuthorized(c, "switchOrganization");
  if ("response" in authorized) {
    return authorized.response;
  }

  try {
    const body = await c.req.json().catch(() => undefined);
    const session = await switchOrganization(
      authorized.auth.principal,
      body,
      requestMeta(c.req.raw)
    );
    const { refreshToken, ...response } = session;
    setSessionCookie(c, refreshToken, response.session.expiresAt, c.req.raw);
    return c.json(response);
  } catch (error) {
    return handleAuthError(c, error, "Unable to switch organization");
  }
});

app.post(routePath("createOrganization"), async (c) => {
  const authorized = await authenticateAuthorized(c, "createOrganization");
  if ("response" in authorized) {
    return authorized.response;
  }

  try {
    const body = await c.req.json().catch(() => undefined);
    const session = await createOrganization(
      authorized.auth.principal,
      body,
      requestMeta(c.req.raw)
    );
    const { refreshToken, ...response } = session;
    setSessionCookie(c, refreshToken, response.session.expiresAt, c.req.raw);
    return c.json(response);
  } catch (error) {
    return handleAuthError(c, error, "Unable to create organization");
  }
});

app.post(routePath("updateCurrentUser"), async (c) => {
  const authorized = await authenticateAuthorized(c, "updateCurrentUser");
  if ("response" in authorized) {
    return authorized.response;
  }

  try {
    const body = await c.req.json().catch(() => undefined);
    const response = await updateCurrentUser(authorized.auth.principal, body);
    publishAuthRefresh(
      { userId: authorized.auth.principal.userId },
      "claims_changed"
    );
    return c.json(response);
  } catch (error) {
    return handleAuthError(c, error, "Unable to update user");
  }
});

app.post(routePath("updateCurrentOrganization"), async (c) => {
  const authorized = await authenticateAuthorized(c, "updateCurrentOrganization");
  if ("response" in authorized) {
    return authorized.response;
  }

  try {
    const body = await c.req.json().catch(() => undefined);
    const response = await updateCurrentOrganization(
      authorized.auth.principal,
      body
    );
    publishAuthRefresh(
      { organizationId: authorized.auth.principal.organizationId ?? undefined },
      "organization_changed"
    );
    return c.json(response);
  } catch (error) {
    return handleAuthError(c, error, "Unable to update organization");
  }
});

app.post(routePath("deleteCurrentOrganization"), async (c) => {
  const authorized = await authenticateAuthorized(c, "deleteCurrentOrganization");
  if ("response" in authorized) {
    return authorized.response;
  }

  try {
    const result = await deleteCurrentOrganization(
      authorized.auth.principal,
      requestMeta(c.req.raw)
    );
    publishAuthRefresh(
      { organizationId: authorized.auth.principal.organizationId ?? undefined },
      "organization_changed"
    );
    setSessionCookie(
      c,
      result.refreshToken,
      result.nextSession.session.expiresAt,
      c.req.raw
    );
    return c.json({
      requiresOrganization: result.requiresOrganization,
      nextSession: result.nextSession
    });
  } catch (error) {
    return handleAuthError(c, error, "Unable to delete organization");
  }
});

app.get(routePath("listOrganizationMembers"), async (c) => {
  const authorized = await authenticateAuthorized(c, "listOrganizationMembers");
  if ("response" in authorized) {
    return authorized.response;
  }

  try {
    return c.json(await listOrganizationMembers(authorized.auth.principal));
  } catch (error) {
    return handleAuthError(c, error, "Unable to list organization members");
  }
});

app.post(routePath("updateOrganizationMemberRole"), async (c) => {
  const authorized = await authenticateAuthorized(c, "updateOrganizationMemberRole");
  if ("response" in authorized) {
    return authorized.response;
  }

  try {
    const body = await c.req.json().catch(() => undefined);
    const members = await updateOrganizationMemberRole(
      authorized.auth.principal,
      body
    );
    publishAuthRefresh(
      { membershipId: membershipIdFromBody(body) },
      "membership_changed"
    );
    return c.json(members);
  } catch (error) {
    return handleAuthError(c, error, "Unable to update member role");
  }
});

app.post(routePath("removeOrganizationMember"), async (c) => {
  const authorized = await authenticateAuthorized(c, "removeOrganizationMember");
  if ("response" in authorized) {
    return authorized.response;
  }

  try {
    const body = await c.req.json().catch(() => undefined);
    const members = await removeOrganizationMember(
      authorized.auth.principal,
      body
    );
    publishAuthRefresh(
      { membershipId: membershipIdFromBody(body) },
      "membership_changed"
    );
    return c.json(members);
  } catch (error) {
    return handleAuthError(c, error, "Unable to remove member");
  }
});

app.post(routePath("createOrganizationInvite"), async (c) => {
  const authorized = await authenticateAuthorized(c, "createOrganizationInvite");
  if ("response" in authorized) {
    return authorized.response;
  }

  try {
    const body = await c.req.json().catch(() => undefined);
    return c.json(
      await createOrganizationInvite(authorized.auth.principal, body)
    );
  } catch (error) {
    return handleAuthError(c, error, "Unable to create invite");
  }
});

app.get(routePath("listOrganizationInvites"), async (c) => {
  const authorized = await authenticateAuthorized(c, "listOrganizationInvites");
  if ("response" in authorized) {
    return authorized.response;
  }

  try {
    return c.json(await listOrganizationInvites(authorized.auth.principal));
  } catch (error) {
    return handleAuthError(c, error, "Unable to list invites");
  }
});

app.get(routePath("fetchInferenceConfig"), async (c) => {
  const authorized = await authenticateAuthorized(c, "fetchInferenceConfig");
  if ("response" in authorized) {
    return authorized.response;
  }
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) {
    return organizationRequired(c);
  }

  return c.json(await getInferenceConfig(principal.organizationId));
});

app.post(routePath("createInferenceProvider"), async (c) => {
  const authorized = await authenticateAuthorized(c, "createInferenceProvider");
  if ("response" in authorized) {
    return authorized.response;
  }
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) {
    return organizationRequired(c);
  }

  try {
    const body = await c.req.json().catch(() => undefined);
    const provider = await createInferenceProvider(
      principal.organizationId,
      body
    );
    return c.json(provider);
  } catch (error) {
    return handleInferenceError(c, error, "Unable to add provider");
  }
});

app.post(routePath("updateInferenceProvider"), async (c) => {
  const authorized = await authenticateAuthorized(c, "updateInferenceProvider");
  if ("response" in authorized) {
    return authorized.response;
  }
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) {
    return organizationRequired(c);
  }

  try {
    const body = await c.req.json().catch(() => undefined);
    return c.json(
      await updateInferenceProvider(principal.organizationId, body)
    );
  } catch (error) {
    return handleInferenceError(c, error, "Unable to update provider");
  }
});

app.post(routePath("updateInferenceModel"), async (c) => {
  const authorized = await authenticateAuthorized(c, "updateInferenceModel");
  if ("response" in authorized) {
    return authorized.response;
  }
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) {
    return organizationRequired(c);
  }

  try {
    const body = await c.req.json().catch(() => undefined);
    return c.json(await updateInferenceModel(principal.organizationId, body));
  } catch (error) {
    return handleInferenceError(c, error, "Unable to update model");
  }
});

app.post(routePath("deleteInferenceProvider"), async (c) => {
  const authorized = await authenticateAuthorized(c, "deleteInferenceProvider");
  if ("response" in authorized) {
    return authorized.response;
  }
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) {
    return organizationRequired(c);
  }

  try {
    const body = await c.req.json().catch(() => undefined);
    return c.json(
      await deleteInferenceProvider(principal.organizationId, body)
    );
  } catch (error) {
    return handleInferenceError(c, error, "Unable to delete provider");
  }
});

app.post(routePath("updateInferenceModelDefault"), async (c) => {
  const authorized = await authenticateAuthorized(c, "updateInferenceModelDefault");
  if ("response" in authorized) {
    return authorized.response;
  }
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) {
    return organizationRequired(c);
  }

  try {
    const body = await c.req.json().catch(() => undefined);
    return c.json(
      await updateInferenceModelDefault(principal.organizationId, body)
    );
  } catch (error) {
    return handleInferenceError(c, error, "Unable to update model default");
  }
});

app.get(routePath("listProjects"), async (c) => {
  const authorized = await authenticateAuthorized(c, "listProjects");
  if ("response" in authorized) return authorized.response;
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) return organizationRequired(c);

  try {
    return c.json(await listProjects(principal));
  } catch (error) {
    return handleSessionStateError(c, error, "Unable to list projects");
  }
});

app.post(routePath("createProject"), async (c) => {
  const authorized = await authenticateAuthorized(c, "createProject");
  if ("response" in authorized) return authorized.response;
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) return organizationRequired(c);

  try {
    const body = await c.req.json().catch(() => undefined);
    return c.json(await createProject(principal, body));
  } catch (error) {
    return handleSessionStateError(c, error, "Unable to create project");
  }
});

app.get(routePath("fetchProjectById"), async (c) => {
  const authorized = await authenticateAuthorized(c, "fetchProjectById");
  if ("response" in authorized) return authorized.response;
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) return organizationRequired(c);

  try {
    return c.json(await fetchProject(principal, projectIdParam(c)));
  } catch (error) {
    return handleSessionStateError(c, error, "Unable to load project");
  }
});

app.patch(routePath("updateProject"), async (c) => {
  const authorized = await authenticateAuthorized(c, "updateProject");
  if ("response" in authorized) return authorized.response;
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) return organizationRequired(c);

  try {
    const body = await c.req.json().catch(() => undefined);
    return c.json(await updateProject(principal, projectIdParam(c), body));
  } catch (error) {
    return handleSessionStateError(c, error, "Unable to update project");
  }
});

app.post(routePath("deleteProject"), async (c) => {
  const authorized = await authenticateAuthorized(c, "deleteProject");
  if ("response" in authorized) return authorized.response;
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) return organizationRequired(c);

  try {
    return c.json(await deleteProject(principal, projectIdParam(c)));
  } catch (error) {
    return handleSessionStateError(c, error, "Unable to delete project");
  }
});

app.post(routePath("addProjectContext"), async (c) => {
  const authorized = await authenticateAuthorized(c, "addProjectContext");
  if ("response" in authorized) return authorized.response;
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) return organizationRequired(c);

  try {
    const body = await c.req.json().catch(() => undefined);
    return c.json(await addProjectContext(principal, projectIdParam(c), body));
  } catch (error) {
    return handleSessionStateError(c, error, "Unable to add project context");
  }
});

app.post(routePath("deleteProjectContext"), async (c) => {
  const authorized = await authenticateAuthorized(c, "deleteProjectContext");
  if ("response" in authorized) return authorized.response;
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) return organizationRequired(c);

  try {
    return c.json(
      await deleteProjectContext(
        principal,
        projectIdParam(c),
        contextIdParam(c)
      )
    );
  } catch (error) {
    return handleSessionStateError(c, error, "Unable to remove project context");
  }
});

app.get(routePath("listSessions"), async (c) => {
  const authorized = await authenticateAuthorized(c, "listSessions");
  if ("response" in authorized) {
    return authorized.response;
  }
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) {
    return organizationRequired(c);
  }

  try {
    return c.json(await listSessions(principal));
  } catch (error) {
    return handleSessionStateError(c, error, "Unable to list sessions");
  }
});

app.post(routePath("createSession"), async (c) => {
  const authorized = await authenticateAuthorized(c, "createSession");
  if ("response" in authorized) {
    return authorized.response;
  }
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) {
    return organizationRequired(c);
  }

  try {
    const body = await c.req.json().catch(() => undefined);
    return c.json(await createSession(principal, body));
  } catch (error) {
    return handleSessionStateError(c, error, "Unable to create session");
  }
});

app.get(routePath("fetchSessionSettings"), async (c) => {
  const authorized = await authenticateAuthorized(c, "fetchSessionSettings");
  if ("response" in authorized) {
    return authorized.response;
  }
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) {
    return organizationRequired(c);
  }

  try {
    return c.json(await fetchSessionSettings(principal));
  } catch (error) {
    return handleSessionStateError(c, error, "Unable to load session settings");
  }
});

app.patch(routePath("updateSessionSettings"), async (c) => {
  const authorized = await authenticateAuthorized(c, "updateSessionSettings");
  if ("response" in authorized) {
    return authorized.response;
  }
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) {
    return organizationRequired(c);
  }

  try {
    const body = await c.req.json().catch(() => undefined);
    return c.json(await updateSessionSettings(principal, body));
  } catch (error) {
    return handleSessionStateError(c, error, "Unable to update session settings");
  }
});

app.get(routePath("fetchSessionById"), async (c) => {
  const authorized = await authenticateAuthorized(c, "fetchSessionById");
  if ("response" in authorized) {
    return authorized.response;
  }
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) {
    return organizationRequired(c);
  }

  try {
    return c.json(await fetchSession(principal, sessionIdParam(c)));
  } catch (error) {
    return handleSessionStateError(c, error, "Unable to load session");
  }
});

app.patch(routePath("updateSession"), async (c) => {
  const authorized = await authenticateAuthorized(c, "updateSession");
  if ("response" in authorized) {
    return authorized.response;
  }
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) {
    return organizationRequired(c);
  }

  try {
    const body = await c.req.json().catch(() => undefined);
    return c.json(
      await updateSession(principal, sessionIdParam(c), body)
    );
  } catch (error) {
    return handleSessionStateError(c, error, "Unable to update session");
  }
});

app.post(routePath("appendSessionMessage"), async (c) => {
  const authorized = await authenticateAuthorized(c, "appendSessionMessage");
  if ("response" in authorized) {
    return authorized.response;
  }
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) {
    return organizationRequired(c);
  }

  try {
    const body = await c.req.json().catch(() => undefined);
    return c.json(
      await appendSessionMessage(principal, sessionIdParam(c), body)
    );
  } catch (error) {
    return handleSessionStateError(c, error, "Unable to append session message");
  }
});

app.post(routePath("appendSessionState"), async (c) => {
  const authorized = await authenticateAuthorized(c, "appendSessionState");
  if ("response" in authorized) {
    return authorized.response;
  }
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) {
    return organizationRequired(c);
  }

  try {
    const body = await c.req.json().catch(() => undefined);
    return c.json(
      await appendSessionState(principal, sessionIdParam(c), body)
    );
  } catch (error) {
    return handleSessionStateError(c, error, "Unable to append session state");
  }
});

app.post(routePath("truncateSession"), async (c) => {
  const authorized = await authenticateAuthorized(c, "truncateSession");
  if ("response" in authorized) {
    return authorized.response;
  }
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) {
    return organizationRequired(c);
  }

  try {
    const body = await c.req.json().catch(() => undefined);
    return c.json(
      await truncateSession(principal, sessionIdParam(c), body)
    );
  } catch (error) {
    return handleSessionStateError(c, error, "Unable to truncate session");
  }
});

app.post(routePath("archiveSession"), async (c) => {
  const authorized = await authenticateAuthorized(c, "archiveSession");
  if ("response" in authorized) {
    return authorized.response;
  }
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) {
    return organizationRequired(c);
  }

  try {
    return c.json(
      await archiveSession(principal, sessionIdParam(c))
    );
  } catch (error) {
    return handleSessionStateError(c, error, "Unable to archive session");
  }
});

app.post(routePath("streamAgentChat"), async (c) => {
  const authorized = await authenticateAuthorized(c, "streamAgentChat");
  if ("response" in authorized) {
    return authorized.response;
  }
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) {
    return organizationRequired(c);
  }

  const agentSlug = c.req.param("agentSlug");
  if (agentSlug !== getLushAgentMetadata().id) {
    return c.json({ error: "agent_not_found" }, 404);
  }

  const body = await c.req.json().catch(() => undefined);
  const inputMessages = Array.isArray(body?.messages) ? body.messages : [];
  const modelSelection =
    typeof body?.modelSelection === "string" ? body.modelSelection : undefined;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  const clientMessages = normalizeAgentChatMessages(inputMessages);
  let messages: AgentChatMessage[];
  let project: ProjectAgentContext | undefined;

  try {
    const sessionContext = await loadLushSessionContext(
      {
        userId: principal.userId,
        organizationId: principal.organizationId
      },
      sessionId
    );
    messages = mergeSessionMessages(sessionContext.messages, clientMessages);
    project = sessionContext.project;
  } catch (error) {
    if (error instanceof SessionContextError) {
      return c.json(
        { error: error.code, message: error.message },
        error.status as ContentfulStatusCode
      );
    }

    throw error;
  }

  if (messages.length === 0) {
    return c.json({ error: "messages_required" }, 400);
  }

  return streamChat(principal, c.req.raw, modelSelection, messages, project);
});

app.post(routePath("streamAgentPrompt"), async (c) => {
  const authorized = await authenticateAuthorized(c, "streamAgentPrompt");
  if ("response" in authorized) {
    return authorized.response;
  }
  const principal = organizationPrincipal(authorized.auth.principal);
  if (!principal) {
    return organizationRequired(c);
  }

  const agentSlug = c.req.param("agentSlug");
  if (agentSlug !== getLushAgentMetadata().id) {
    return c.json({ error: "agent_not_found" }, 404);
  }

  const body = await c.req.json().catch(() => undefined);
  const inputMessages = Array.isArray(body?.messages) ? body.messages : [];
  const modelSelection =
    typeof body?.modelSelection === "string" ? body.modelSelection : undefined;
  const messages = normalizeAgentChatMessages(inputMessages);

  if (messages.length === 0) {
    return c.json({ error: "messages_required" }, 400);
  }

  return streamChat(principal, c.req.raw, modelSelection, messages);
});

const server = Bun.serve({
  port,
  hostname,
  ...({ idleTimeout: 255 } as { idleTimeout: number }),
  fetch: app.fetch
});

logger.info(
  {
    hostname: server.hostname,
    port: server.port
  },
  "api listening"
);

export type AppType = typeof app;

function streamClientEvents(request: Request, principal: Principal) {
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;

  function cleanup() {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = undefined;
    }
    unsubscribe?.();
    unsubscribe = undefined;
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      const send = (event: ClientEvent) => {
        write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      };

      unsubscribe = clientEvents.subscribe(
        {
          userId: principal.userId,
          sessionId: principal.sessionId,
          organizationId: principal.organizationId,
          membershipId: principal.membershipId
        },
        send
      );
      write(": connected\n\n");
      heartbeat = setInterval(() => write(": heartbeat\n\n"), 25_000);
      request.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      cleanup();
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive"
    }
  });
}

function publishAuthRefresh(
  scope: ClientEventScope,
  reason: AuthRefreshReason
) {
  if (Object.values(scope).every((value) => value === undefined)) {
    return;
  }

  clientEvents.publishAuthRefresh(scope, reason);
}

function membershipIdFromBody(body: unknown) {
  return body && typeof body === "object"
    ? typeof (body as { membershipId?: unknown }).membershipId === "string"
      ? (body as { membershipId: string }).membershipId
      : undefined
    : undefined;
}

function readApiRuntimeConfig() {
  const env = readEnvSchema({
    DATABASE_URL: envSchema.string(),
    LUSH_APP_ORIGIN: envSchema.commaList(),
    LUSH_AUTH_JWT_PRIVATE_KEY: envSchema.string(),
    LUSH_AUTH_JWT_PUBLIC_KEY: envSchema.string(),
    LUSH_SECRET_KEY: envSchema.string(),
    LUSH_API_PORT: envSchema.number(7330),
    LUSH_API_HOST: envSchema.optionalString("0.0.0.0")
  });
  const appOrigins = env.LUSH_APP_ORIGIN;
  if (appOrigins.includes("*")) {
    throw new ConfigError(
      "Invalid environment variable LUSH_APP_ORIGIN: wildcard origins are not allowed because auth uses credentialed cookies.",
      { invalid: ["LUSH_APP_ORIGIN"] }
    );
  }

  return {
    port: env.LUSH_API_PORT,
    hostname: env.LUSH_API_HOST,
    appOrigins
  };
}

async function authenticateAccess(request: Request) {
  const token = bearerToken(request);
  if (!token) {
    return undefined;
  }

  return resolveAccessPrincipal(token);
}

async function authenticateRefresh(request: Request) {
  const token = sessionCookie(request);
  if (!token) {
    return undefined;
  }

  return resolveRefreshSession(token, requestMeta(request));
}

async function authenticateAuthorized(c: Context, action: AuthzAction) {
  const auth = await authenticateAccess(c.req.raw);
  if (!auth) {
    return { response: unauthorized(c) };
  }

  try {
    authorizePrincipal(auth.principal, action);
    return { auth };
  } catch (error) {
    return {
      response: handleAuthError(c, error, "Not authorized")
    };
  }
}

function organizationPrincipal(
  principal: Principal
): OrganizationPrincipal | undefined {
  if (!principal.organizationId || !principal.membershipId || !principal.role) {
    return undefined;
  }

  return principal as OrganizationPrincipal;
}

function sessionCookie(request: Request) {
  const cookies = request.headers.get("cookie");
  if (!cookies) {
    return undefined;
  }

  for (const cookie of cookies.split(";")) {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (name === sessionCookieName) {
      const value = valueParts.join("=");
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }

  return undefined;
}

function setSessionCookie(
  c: Context,
  token: string,
  expiresAt: string,
  request: Request
) {
  c.header(
    "set-cookie",
    serializeSessionCookie(token, [
      `Expires=${new Date(expiresAt).toUTCString()}`,
      `Max-Age=${Math.max(
        0,
        Math.floor((Date.parse(expiresAt) - Date.now()) / 1000)
      )}`,
      ...secureCookieAttributes(request)
    ])
  );
}

function clearSessionCookie(c: Context, request: Request) {
  c.header(
    "set-cookie",
    serializeSessionCookie("", [
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      "Max-Age=0",
      ...secureCookieAttributes(request)
    ])
  );
}

function serializeSessionCookie(value: string, attributes: string[]) {
  return [
    `${sessionCookieName}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    ...attributes
  ].join("; ");
}

function secureCookieAttributes(request: Request) {
  return isSecureRequest(request) ? ["Secure"] : [];
}

function isSecureRequest(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.split(",")[0]?.trim() === "https";
  }

  return new URL(request.url).protocol === "https:";
}

function requestMeta(request: Request) {
  return {
    userAgent: request.headers.get("user-agent"),
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip")
  };
}

async function streamChat(
  principal: OrganizationPrincipal,
  request: Request,
  modelSelection: string | undefined,
  messages: AgentChatMessage[],
  project?: ProjectAgentContext
) {
  const abortController = new AbortController();
  request.signal.addEventListener("abort", () => abortController.abort(), {
    once: true
  });
  const generator = streamLushAgentChat({
    organizationId: principal.organizationId,
    modelSelection,
    messages,
    project,
    signal: abortController.signal
  });
  let firstChunk: IteratorResult<string>;

  try {
    firstChunk = await generator.next();
  } catch (error) {
    return agentStreamErrorResponse(error);
  }

  const stream = new ReadableStream({
    async start(controllerStream) {
      const encoder = new TextEncoder();

      try {
        for await (const event of agentTextEventStream(generator, firstChunk)) {
          controllerStream.enqueue(encoder.encode(encodeAgentStreamEvent(event)));
        }

        controllerStream.close();
      } catch (error) {
        logger.error(
          {
            err: error,
            organizationId: principal.organizationId,
            agent: getLushAgentMetadata().id
          },
          "agent stream failed after response started"
        );
        controllerStream.enqueue(
          encoder.encode(
            encodeAgentStreamEvent({
              type: "response-error",
              message: error instanceof Error ? error.message : "Agent stream failed"
            })
          )
        );
        controllerStream.close();
      }
    },
    cancel() {
      abortController.abort();
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": agentStreamContentType,
      "cache-control": "no-cache, no-transform",
      "x-lush-agent": getLushAgentMetadata().id,
      "x-lush-organization": principal.organizationId
    }
  });
}

function unauthorized(c: Context) {
  return c.json({ error: "unauthorized" }, 401);
}

function organizationRequired(c: Context) {
  return c.json(
    {
      error: "organization_required",
      message: "Create or switch to an organization before using this route"
    },
    403
  );
}

function handleAuthError(
  c: Context,
  error: unknown,
  fallbackMessage: string
) {
  if (error instanceof AuthError) {
    return c.json(
      { error: error.code, message: error.message },
      contentfulStatus(error.status)
    );
  }

  logger.error({ err: error }, fallbackMessage);
  return c.json({ error: "auth_failed", message: fallbackMessage }, 400);
}

function handleInferenceError(
  c: Context,
  error: unknown,
  fallbackMessage: string
) {
  if (error instanceof InferenceError) {
    return c.json(
      { error: error.code, message: error.message },
      contentfulStatus(error.status)
    );
  }

  return c.json(
    { error: "inference_update_failed", message: fallbackMessage },
    400
  );
}

function handleSessionStateError(
  c: Context,
  error: unknown,
  fallbackMessage: string
) {
  if (error instanceof SessionStateError) {
    return c.json(
      { error: error.code, message: error.message },
      contentfulStatus(error.status)
    );
  }

  logger.error({ err: error }, fallbackMessage);
  return c.json(
    { error: "session_state_failed", message: fallbackMessage },
    400
  );
}

function contentfulStatus(status: number): ContentfulStatusCode {
  return contentfulStatusCodes.has(status)
    ? (status as ContentfulStatusCode)
    : 500;
}

function agentStreamErrorResponse(error: unknown) {
  const details = agentStreamErrorDetails(error);
  if (details.status !== 499) {
    logger.error(
      {
        err: error,
        code: details.code,
        status: details.status
      },
      "agent stream failed before response started"
    );
  }

  return new Response(
    JSON.stringify({
      error: details.code,
      message: details.message
    }),
    {
      status: details.status,
      headers: {
        "content-type": "application/json; charset=utf-8"
      }
    }
  );
}

function agentStreamErrorDetails(error: unknown) {
  if (error instanceof InferenceError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status
    };
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return {
      code: "agent_request_cancelled",
      message: "The inference request was cancelled.",
      status: 499
    };
  }

  const rawMessage = error instanceof Error ? error.message : "";
  const providerStatus = rawMessage.match(/^Provider request failed with (\d+)/);
  if (providerStatus) {
    const status = Number(providerStatus[1]);
    return {
      code: "provider_request_failed",
      message: providerFailureMessage(status),
      status: status === 429 ? 429 : 502
    };
  }

  if (/operation-specific reason/i.test(rawMessage)) {
    return {
      code: "provider_connection_interrupted",
      message:
        "The inference provider connection was interrupted before a response arrived. Please retry, or check the provider endpoint and model settings.",
      status: 504
    };
  }

  return {
    code: "agent_stream_failed",
    message:
      "The inference provider did not return a usable response. Please retry, or check the provider configuration.",
    status: 502
  };
}

function providerFailureMessage(status: number) {
  if (status === 401 || status === 403) {
    return "The inference provider rejected the stored API key. Check the provider credentials in inference settings.";
  }

  if (status === 404) {
    return "The inference provider endpoint or selected model was not found. Check the provider base URL and model settings.";
  }

  if (status === 429) {
    return "The inference provider rate limited the request. Please wait and try again.";
  }

  if (status >= 500) {
    return "The inference provider is unavailable or returned an internal error. Please retry in a moment.";
  }

  return "The inference provider rejected the request. Check the provider configuration and selected model.";
}
