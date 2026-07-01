import { describe, expect, test } from "bun:test";
import {
  buildRequestLogMeta,
  compileRequestLogRoutes,
  matchRequestRoute,
  type RequestLogRoute
} from "../services/api/src/request-log";

const routeDefinitions: RequestLogRoute[] = [
  { id: "health", method: "GET", path: "/health" },
  { id: "listAgentSessions", method: "GET", path: "/v1beta/sessions" },
  { id: "createAgentSession", method: "POST", path: "/v1beta/sessions" },
  {
    id: "fetchAgentSession",
    method: "GET",
    path: "/v1beta/sessions/:sessionId"
  }
];
const routes = compileRequestLogRoutes(routeDefinitions);

describe("api request logging", () => {
  test("matches exact routes by method and path", () => {
    expect(matchRequestRoute("GET", "/v1beta/sessions", routes)?.id)
      .toBe("listAgentSessions");
    expect(matchRequestRoute("POST", "/v1beta/sessions", routes)?.id)
      .toBe("createAgentSession");
  });

  test("matches parameterized routes", () => {
    expect(matchRequestRoute("GET", "/v1beta/sessions/thread-1", routes))
      .toMatchObject({
        id: "fetchAgentSession",
        path: "/v1beta/sessions/:sessionId"
      });
  });

  test("matches trailing slash variants", () => {
    expect(matchRequestRoute("GET", "/v1beta/sessions/", routes)?.id)
      .toBe("listAgentSessions");
  });

  test("builds basic request metadata without query strings", () => {
    const request = new Request(
      "http://api.test/v1beta/sessions/thread-1?access_token=secret",
      {
        headers: {
          "content-length": "42",
          "user-agent": "test-agent",
          "x-forwarded-for": "203.0.113.10, 10.0.0.1"
        }
      }
    );
    const response = new Response("ok", {
      status: 200,
      headers: { "content-length": "2" }
    });

    expect(
      buildRequestLogMeta(request, {
        routes,
        statusCode: 200,
        durationMs: 12.34,
        requestId: "req-1",
        response
      })
    ).toEqual({
      method: "GET",
      path: "/v1beta/sessions/thread-1",
      route: "/v1beta/sessions/:sessionId",
      routeId: "fetchAgentSession",
      statusCode: 200,
      durationMs: 12.34,
      requestId: "req-1",
      contentLength: 42,
      responseContentLength: 2,
      userAgent: "test-agent",
      ipAddress: "203.0.113.10"
    });
  });
});
