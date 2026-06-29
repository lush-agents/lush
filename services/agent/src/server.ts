import {
  type AgentChatMessage,
  getLushAgentMetadata,
  streamLushAgentChat
} from "./runtime";

const port = Number(process.env.LUSH_AGENT_PORT ?? 7331);
type DevSession = {
  token: string;
  userId: string;
  organizationId: string;
  displayName: string;
  handle: string;
  organizationName: string;
  createdAt: string;
};

const sessions = new Map<string, DevSession>();

const corsHeaders = {
  "access-control-allow-origin": process.env.LUSH_APP_ORIGIN ?? "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-max-age": "86400"
};

const server = Bun.serve({
  port,
  hostname: "127.0.0.1",
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

    if (request.method === "POST" && url.pathname === "/auth/dev-session") {
      return createDevSession(request);
    }

    if (request.method === "GET" && url.pathname === "/session") {
      const session = getSession(request);
      if (!session) {
        return unauthorized();
      }

      return Response.json(
        {
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
        },
        { headers: corsHeaders }
      );
    }

    if (request.method === "POST" && url.pathname === "/agents/lush/chat") {
      const session = getSession(request);
      if (!session) {
        return unauthorized();
      }

      return streamChat(request, session);
    }

    return Response.json(
      { error: "not_found" },
      { status: 404, headers: corsHeaders }
    );
  }
});

console.log(`@lush/agent listening on http://${server.hostname}:${server.port}`);

async function createDevSession(request: Request) {
  const body = await request.json().catch(() => ({}));
  const candidate = body && typeof body === "object" ? body as Record<string, unknown> : {};
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

  return Response.json(
    {
      token,
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
    },
    { headers: corsHeaders }
  );
}

async function streamChat(request: Request, session: DevSession) {
  const body = await request.json().catch(() => undefined);
  const inputMessages = Array.isArray(body?.messages) ? body.messages : [];
  const modelSelection =
    typeof body?.modelSelection === "string" ? body.modelSelection : undefined;
  const messages = normalizeMessages(inputMessages);

  if (messages.length === 0) {
    return Response.json(
      { error: "messages_required" },
      { status: 400, headers: corsHeaders }
    );
  }

  const controller = new AbortController();
  request.signal.addEventListener("abort", () => controller.abort(), {
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
          signal: controller.signal
        })) {
          controllerStream.enqueue(encoder.encode(chunk));
        }

        controllerStream.close();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown streaming error";
        controllerStream.enqueue(
          encoder.encode(`\n\n[Agent error] ${message}`)
        );
        controllerStream.close();
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
      "x-lush-organization": session.organizationId
    }
  });
}

function getSession(request: Request) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return undefined;
  }

  return sessions.get(match[1]);
}

function unauthorized() {
  return Response.json(
    { error: "unauthorized" },
    { status: 401, headers: corsHeaders }
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
