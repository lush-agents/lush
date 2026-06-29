import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import {
  type AgentChatMessage,
  getLushAgentMetadata,
  streamLushAgentChat
} from "@lush/agent/runtime";
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
  ConfigError,
  envSchema,
  readEnvSchema
} from "@lush/config/env";
import {
  ClientEventBroker,
  type AuthRefreshReason,
  type ClientEvent,
  type ClientEventScope
} from "./client-events";
import { apiSpec } from "./spec";

const apiConfig = readApiRuntimeConfig();
const port = apiConfig.port;
const hostname = apiConfig.hostname;
const app = new Hono();
const sessionCookieName = "lush_session";
const clientEvents = new ClientEventBroker();
type ApiRouteId = (typeof apiSpec.routes)[number]["id"];
type OrganizationPrincipal = Principal & {
  organizationId: string;
  membershipId: string;
  role: NonNullable<Principal["role"]>;
};
const routePaths = Object.fromEntries(
  apiSpec.routes.map((route) => [route.id, route.path])
) as unknown as Record<ApiRouteId, `/${string}`>;

const desktopAppOrigins = [
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost"
];
const allowedOrigins = Array.from(
  new Set([...apiConfig.appOrigins, ...desktopAppOrigins])
);

app.use(
  "*",
  cors({
    origin: allowedOrigins,
    allowHeaders: ["authorization", "content-type"],
    allowMethods: ["GET", "POST", "OPTIONS"],
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
  return routePaths[id];
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

    return c.json(await refreshAccessSession(refreshToken, requestMeta(c.req.raw)));
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
  const messages = normalizeMessages(inputMessages);

  if (messages.length === 0) {
    return c.json({ error: "messages_required" }, 400);
  }

  return streamChat(principal, c.req.raw, modelSelection, messages);
});

const server = Bun.serve({
  port,
  hostname,
  fetch: app.fetch
});

console.log(`@lush/api listening on http://${server.hostname}:${server.port}`);

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

function streamChat(
  principal: OrganizationPrincipal,
  request: Request,
  modelSelection: string | undefined,
  messages: AgentChatMessage[]
) {
  const abortController = new AbortController();
  request.signal.addEventListener("abort", () => abortController.abort(), {
    once: true
  });

  const stream = new ReadableStream({
    async start(controllerStream) {
      const encoder = new TextEncoder();

      try {
        for await (const chunk of streamLushAgentChat({
          organizationId: principal.organizationId,
          modelSelection,
          messages,
          signal: abortController.signal
        })) {
          controllerStream.enqueue(encoder.encode(chunk));
        }

        controllerStream.close();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown streaming error";
        controllerStream.enqueue(encoder.encode(`\n\n[Agent error] ${message}`));
        controllerStream.close();
      }
    },
    cancel() {
      abortController.abort();
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-lush-agent": getLushAgentMetadata().id,
      "x-lush-organization": principal.organizationId
    }
  });
}

function unauthorized(c: { json: (object: { error: string }, status?: number) => Response }) {
  return c.json({ error: "unauthorized" }, 401);
}

function organizationRequired(c: {
  json: (
    object: { error: string; message: string },
    status?: number
  ) => Response;
}) {
  return c.json(
    {
      error: "organization_required",
      message: "Create or switch to an organization before using this route"
    },
    403
  );
}

function handleAuthError(
  c: {
    json: (
      object: { error: string; message: string },
      status?: number
    ) => Response;
  },
  error: unknown,
  fallbackMessage: string
) {
  if (error instanceof AuthError) {
    return c.json({ error: error.code, message: error.message }, error.status);
  }

  console.error(`${fallbackMessage}:`, error);
  return c.json({ error: "auth_failed", message: fallbackMessage }, 400);
}

function handleInferenceError(
  c: {
    json: (
      object: { error: string; message: string },
      status?: number
    ) => Response;
  },
  error: unknown,
  fallbackMessage: string
) {
  if (error instanceof InferenceError) {
    return c.json({ error: error.code, message: error.message }, error.status);
  }

  return c.json(
    { error: "inference_update_failed", message: fallbackMessage },
    400
  );
}

function normalizeMessages(messages: unknown[]): AgentChatMessage[] {
  return messages
    .map((message) => {
      if (!message || typeof message !== "object") {
        return undefined;
      }

      const candidate = message as Record<string, unknown>;
      const role = candidate.role;
      const content = candidate.content;

      if (
        (role !== "user" && role !== "assistant") ||
        typeof content !== "string"
      ) {
        return undefined;
      }

      return {
        role,
        content
      };
    })
    .filter((message): message is AgentChatMessage => Boolean(message));
}
