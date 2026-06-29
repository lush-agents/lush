import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  type AgentChatMessage,
  getLushAgentMetadata,
  streamLushAgentChat
} from "@lush/agent/runtime";
import {
  createInferenceProvider,
  deleteInferenceProvider,
  getInferenceConfig,
  InferenceError,
  updateInferenceModelDefault,
  updateInferenceModel,
  updateInferenceProvider
} from "@lush/inference/runtime";
import { apiSpec } from "./spec";

type DevSession = {
  token: string;
  userId: string;
  organizationId: string;
  displayName: string;
  handle: string;
  organizationName: string;
  createdAt: string;
};

const port = Number(process.env.LUSH_API_PORT ?? 7330);
const hostname = process.env.LUSH_API_HOST ?? "0.0.0.0";
const sessions = new Map<string, DevSession>();
const app = new Hono();

const desktopAppOrigins = [
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost"
];
const configuredOrigins =
  process.env.LUSH_APP_ORIGIN?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];
const allowedOrigins =
  configuredOrigins.length > 0
    ? Array.from(new Set([...configuredOrigins, ...desktopAppOrigins]))
    : ["*"];

app.use(
  "*",
  cors({
    origin: allowedOrigins,
    allowHeaders: ["authorization", "content-type"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    maxAge: 86400
  })
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "@lush/api",
    agent: getLushAgentMetadata().id,
    routes: apiSpec.routes.map((route) => ({
      id: route.id,
      method: route.method,
      path: route.path
    }))
  })
);

app.post("/auth/dev-session", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const candidate =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const token = crypto.randomUUID();
  const session: DevSession = {
    token,
    userId: "dev-user",
    organizationId: "dev-org",
    displayName:
      typeof candidate.displayName === "string" && candidate.displayName.trim()
        ? candidate.displayName.trim()
        : "First Last",
    handle:
      typeof candidate.handle === "string" && candidate.handle.trim()
        ? candidate.handle.trim().replace(/^@+/, "")
        : "first",
    organizationName:
      typeof candidate.organizationName === "string" &&
      candidate.organizationName.trim()
        ? candidate.organizationName.trim()
        : "Example, Inc.",
    createdAt: new Date().toISOString()
  };

  sessions.set(token, session);

  return c.json(toSessionResponse(session, true));
});

app.get("/session", (c) => {
  const session = getSession(c.req.raw);
  if (!session) {
    return c.json({ error: "unauthorized" }, 401);
  }

  return c.json(toSessionResponse(session, false));
});

app.get("/inference/config", (c) => {
  const session = getSession(c.req.raw);
  if (!session) {
    return c.json({ error: "unauthorized" }, 401);
  }

  return c.json({
    ...getInferenceConfig(session.organizationId)
  });
});

app.post("/inference/providers", async (c) => {
  const session = getSession(c.req.raw);
  if (!session) {
    return c.json({ error: "unauthorized" }, 401);
  }

  try {
    const body = await c.req.json().catch(() => undefined);
    const provider = await createInferenceProvider(session.organizationId, body);
    return c.json(provider);
  } catch (error) {
    if (error instanceof InferenceError) {
      return c.json({ error: error.code, message: error.message }, 400);
    }

    return c.json(
      { error: "provider_connect_failed", message: "Unable to add provider" },
      400
    );
  }
});

app.post("/inference/providers/update", async (c) => {
  const session = getSession(c.req.raw);
  if (!session) {
    return c.json({ error: "unauthorized" }, 401);
  }

  try {
    const body = await c.req.json().catch(() => undefined);
    return c.json(updateInferenceProvider(session.organizationId, body));
  } catch (error) {
    return handleInferenceError(c, error, "Unable to update provider");
  }
});

app.post("/inference/models/update", async (c) => {
  const session = getSession(c.req.raw);
  if (!session) {
    return c.json({ error: "unauthorized" }, 401);
  }

  try {
    const body = await c.req.json().catch(() => undefined);
    return c.json(updateInferenceModel(session.organizationId, body));
  } catch (error) {
    return handleInferenceError(c, error, "Unable to update model");
  }
});

app.post("/inference/providers/delete", async (c) => {
  const session = getSession(c.req.raw);
  if (!session) {
    return c.json({ error: "unauthorized" }, 401);
  }

  try {
    const body = await c.req.json().catch(() => undefined);
    return c.json(deleteInferenceProvider(session.organizationId, body));
  } catch (error) {
    return handleInferenceError(c, error, "Unable to delete provider");
  }
});

app.post("/inference/model-defaults/update", async (c) => {
  const session = getSession(c.req.raw);
  if (!session) {
    return c.json({ error: "unauthorized" }, 401);
  }

  try {
    const body = await c.req.json().catch(() => undefined);
    return c.json(updateInferenceModelDefault(session.organizationId, body));
  } catch (error) {
    return handleInferenceError(c, error, "Unable to update model default");
  }
});

app.post("/agents/lush/chat", async (c) => {
  const session = getSession(c.req.raw);
  if (!session) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => undefined);
  const inputMessages = Array.isArray(body?.messages) ? body.messages : [];
  const modelSelection =
    typeof body?.modelSelection === "string" ? body.modelSelection : undefined;
  const messages = normalizeMessages(inputMessages);

  if (messages.length === 0) {
    return c.json({ error: "messages_required" }, 400);
  }

  const abortController = new AbortController();
  c.req.raw.signal.addEventListener("abort", () => abortController.abort(), {
    once: true
  });

  const stream = new ReadableStream({
    async start(controllerStream) {
      const encoder = new TextEncoder();

      try {
        for await (const chunk of streamLushAgentChat({
          organizationId: session.organizationId,
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
      "x-lush-organization": session.organizationId
    }
  });
});

const server = Bun.serve({
  port,
  hostname,
  fetch: app.fetch
});

console.log(`@lush/api listening on http://${server.hostname}:${server.port}`);

export type AppType = typeof app;

function toSessionResponse(session: DevSession, includeToken: true): {
  token: string;
  user: {
    id: string;
    displayName: string;
    handle: string;
  };
  organization: {
    id: string;
    name: string;
  };
  createdAt: string;
};
function toSessionResponse(session: DevSession, includeToken: false): {
  user: {
    id: string;
    displayName: string;
    handle: string;
  };
  organization: {
    id: string;
    name: string;
  };
  createdAt: string;
};
function toSessionResponse(session: DevSession, includeToken: boolean) {
  return {
    ...(includeToken ? { token: session.token } : {}),
    user: {
      id: session.userId,
      displayName: session.displayName,
      handle: session.handle
    },
    organization: {
      id: session.organizationId,
      name: session.organizationName
    },
    createdAt: session.createdAt
  };
}

function getSession(request: Request) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return undefined;
  }

  return sessions.get(match[1]);
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
    return c.json({ error: error.code, message: error.message }, 400);
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
