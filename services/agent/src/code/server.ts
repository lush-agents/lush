import type { SendCodeInputRequest, StartCodeSessionRequest } from "@lush/code";
import { CodeNotFoundError, LocalCodeOrchestrator } from "./orchestrator";
import { CodeSessionStore } from "./store";

const allowedOrigins = new Set([
  "http://localhost:5874",
  "http://127.0.0.1:5874",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost"
]);

export function startCodeSidecar(options: { token: string; stateDirectory: string; port?: number }) {
  if (options.token.length < 32) throw new Error("The sidecar capability token must be at least 32 characters");
  const orchestrator = new LocalCodeOrchestrator(new CodeSessionStore(options.stateDirectory));

  const serve = (port: number) => Bun.serve({
      hostname: "127.0.0.1",
      port,
      async fetch(request) {
      const origin = request.headers.get("origin");
      if (origin && !allowedOrigins.has(origin)) return response({ error: "Origin is not allowed" }, 403, origin);
      if (request.method === "OPTIONS") return response(undefined, 204, origin);
      if (request.headers.get("authorization") !== `Bearer ${options.token}`) {
        return response({ error: "Unauthorized" }, 401, origin);
      }

      const url = new URL(request.url);
      try {
        if (request.method === "GET" && url.pathname === "/v1/harnesses") {
          return response(await orchestrator.listHarnesses(), 200, origin);
        }
        if (request.method === "POST" && url.pathname === "/v1/repositories/inspect") {
          const body = await jsonBody<{ path: string }>(request);
          return response(await orchestrator.inspectRepository(body.path), 200, origin);
        }
        if (request.method === "GET" && url.pathname === "/v1/sessions") {
          return response(await orchestrator.listSessions(), 200, origin);
        }
        if (request.method === "POST" && url.pathname === "/v1/sessions") {
          return response(await orchestrator.startSession(await jsonBody<StartCodeSessionRequest>(request)), 201, origin);
        }

        const match = url.pathname.match(/^\/v1\/sessions\/([0-9a-f-]{36})(?:\/(messages|events|interrupt|archive|open|review))?$/i);
        if (match) {
          const id = match[1]!;
          const action = match[2];
          if (request.method === "GET" && !action) return response(await orchestrator.getSession(id), 200, origin);
          if (request.method === "GET" && action === "events") {
            return response(await orchestrator.events(id, Number(url.searchParams.get("after") ?? 0)), 200, origin);
          }
          if (request.method === "GET" && action === "review") {
            return response(await orchestrator.review(
              id,
              url.searchParams.get("revision") ?? "net",
              url.searchParams.get("comparisonRef") ?? undefined
            ), 200, origin);
          }
          if (request.method === "POST" && action === "messages") {
            return response(await orchestrator.sendInput(id, await jsonBody<SendCodeInputRequest>(request)), 202, origin);
          }
          if (request.method === "POST" && action === "interrupt") return response(await orchestrator.interrupt(id), 202, origin);
          if (request.method === "POST" && action === "archive") return response(await orchestrator.archive(id), 200, origin);
          if (request.method === "POST" && action === "open") {
            const body = await jsonBody<{ target: "finder" | "terminal" | "editor" }>(request);
            if (!(["finder", "terminal", "editor"] as string[]).includes(body.target)) throw new Error("Invalid workspace open target");
            await orchestrator.openWorkspace(id, body.target);
            return response({ opened: true }, 200, origin);
          }
        }

        return response({ error: "Not found" }, 404, origin);
      } catch (error) {
        const status = error instanceof CodeNotFoundError ? 404 : 400;
        return response({ error: error instanceof Error ? error.message : "Request failed" }, status, origin);
      }
      }
    });

  const withShutdown = (server: ReturnType<typeof serve>) => Object.assign(server, {
    shutdown: () => orchestrator.shutdown()
  });

  if (options.port && options.port > 0) return withShutdown(serve(options.port));
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return withShutdown(serve(49_152 + Math.floor(Math.random() * (65_535 - 49_152))));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Unable to bind the local Code sidecar");
}

async function jsonBody<T>(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 1024 * 1024) throw new Error("Request exceeds 1 MiB");
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 1024 * 1024) throw new Error("Request exceeds 1 MiB");
  return JSON.parse(raw) as T;
}

function response(body: unknown, status: number, origin: string | null) {
  const headers = new Headers({
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff"
  });
  if (origin && allowedOrigins.has(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-headers", "authorization, content-type");
    headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
    headers.set("vary", "Origin");
  }
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
}
