import { envSchema, readEnvSchema } from "@lush/config/env";
import {
  bearerToken,
  type Principal,
  resolveAccessPrincipal
} from "@lush/authz/runtime";
import { createLogger } from "@lush/logging/logger";
import {
  type AgentChatMessage,
  getLushAgentMetadata,
  streamLushAgentChat
} from "./runtime";
import {
  SessionContextError,
  loadLushSessionMessages,
  mergeSessionMessages
} from "./session-context";
import { normalizeAgentChatMessages } from "./chat-request";

const logger = createLogger("@lush/agent");
const agentConfig = readEnvSchema({
  LUSH_AGENT_PORT: envSchema.number(7331),
  LUSH_APP_ORIGIN: envSchema.optionalString("*")
});

const corsHeaders = {
  "access-control-allow-origin": agentConfig.LUSH_APP_ORIGIN,
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-max-age": "86400"
};

const server = Bun.serve({
  port: agentConfig.LUSH_AGENT_PORT,
  hostname: "127.0.0.1",
  ...({ idleTimeout: 255 } as { idleTimeout: number }),
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json(
        { ok: true, agent: getLushAgentMetadata().id },
        { headers: corsHeaders }
      );
    }

    if (request.method === "GET" && url.pathname === "/session") {
      const auth = await authenticate(request);
      if (!auth) {
        return unauthorized();
      }

      return Response.json(auth.session, { headers: corsHeaders });
    }

    const agentRouteMatch = url.pathname.match(
      /^\/agents\/([^/]+)\/(chat|prompt)$/
    );
    if (request.method === "POST" && agentRouteMatch) {
      const auth = await authenticate(request);
      if (!auth) {
        return unauthorized();
      }

      const agentSlug = decodeURIComponent(agentRouteMatch[1] ?? "");
      if (agentSlug !== getLushAgentMetadata().id) {
        return Response.json(
          { error: "agent_not_found" },
          { status: 404, headers: corsHeaders }
        );
      }

      return agentRouteMatch[2] === "chat"
        ? streamSessionChat(request, auth.principal)
        : streamPrompt(request, auth.principal);
    }

    return Response.json(
      { error: "not_found" },
      { status: 404, headers: corsHeaders }
    );
  }
});

logger.info(
  {
    hostname: server.hostname,
    port: server.port
  },
  "agent listening"
);

async function authenticate(request: Request) {
  const token = bearerToken(request);
  if (!token) {
    return undefined;
  }

  return resolveAccessPrincipal(token);
}

async function streamSessionChat(request: Request, principal: Principal) {
  if (!principal.organizationId) {
    return Response.json(
      {
        error: "organization_required",
        message: "An active organization is required"
      },
      { status: 403, headers: corsHeaders }
    );
  }

  const organizationId = principal.organizationId;
  const body = await request.json().catch(() => undefined);
  const inputMessages = Array.isArray(body?.messages) ? body.messages : [];
  const modelSelection =
    typeof body?.modelSelection === "string" ? body.modelSelection : undefined;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  const clientMessages = normalizeAgentChatMessages(inputMessages);
  let messages: AgentChatMessage[];

  try {
    const persistedMessages = await loadLushSessionMessages(
      {
        userId: principal.userId,
        organizationId
      },
      sessionId
    );
    messages = mergeSessionMessages(persistedMessages, clientMessages);
  } catch (error) {
    if (error instanceof SessionContextError) {
      return Response.json(
        { error: error.code, message: error.message },
        { status: error.status, headers: corsHeaders }
      );
    }

    throw error;
  }

  if (messages.length === 0) {
    return Response.json(
      { error: "messages_required" },
      { status: 400, headers: corsHeaders }
    );
  }

  return streamMessages(request, organizationId, modelSelection, messages);
}

async function streamPrompt(request: Request, principal: Principal) {
  if (!principal.organizationId) {
    return Response.json(
      {
        error: "organization_required",
        message: "An active organization is required"
      },
      { status: 403, headers: corsHeaders }
    );
  }

  const organizationId = principal.organizationId;
  const body = await request.json().catch(() => undefined);
  const inputMessages = Array.isArray(body?.messages) ? body.messages : [];
  const modelSelection =
    typeof body?.modelSelection === "string" ? body.modelSelection : undefined;
  const messages = normalizeAgentChatMessages(inputMessages);

  if (messages.length === 0) {
    return Response.json(
      { error: "messages_required" },
      { status: 400, headers: corsHeaders }
    );
  }

  return streamMessages(request, organizationId, modelSelection, messages);
}

function streamMessages(
  request: Request,
  organizationId: string,
  modelSelection: string | undefined,
  messages: AgentChatMessage[]
) {
  const controller = new AbortController();
  request.signal.addEventListener("abort", () => controller.abort(), {
    once: true
  });

  const stream = new ReadableStream({
    async start(controllerStream) {
      const encoder = new TextEncoder();

      try {
        for await (const chunk of streamLushAgentChat({
          organizationId,
          modelSelection,
          messages,
          signal: controller.signal
        })) {
          controllerStream.enqueue(encoder.encode(chunk));
        }

        controllerStream.close();
      } catch (error) {
        logger.error(
          {
            err: error,
            organizationId,
            agent: getLushAgentMetadata().id
          },
          "agent stream failed after response started"
        );
        controllerStream.error(error);
      }
    },
    cancel() {
      controller.abort();
    }
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-lush-agent": getLushAgentMetadata().id,
      "x-lush-organization": organizationId
    }
  });
}

function unauthorized() {
  return Response.json(
    { error: "unauthorized" },
    { status: 401, headers: corsHeaders }
  );
}
