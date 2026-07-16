import { describe, expect, test } from "bun:test";
import {
  buildRequestLogMeta,
  compileRequestLogRoutes,
  matchRequestRoute,
  type RequestLogRoute
} from "../services/api/src/request-log";

const routeDefinitions: RequestLogRoute[] = [
  { id: "health", method: "GET", path: "/health" },
  { id: "listSessions", method: "GET", path: "/v1beta/sessions" },
  { id: "createSession", method: "POST", path: "/v1beta/sessions" },
  {
    id: "fetchSessionById",
    method: "GET",
    path: "/v1beta/sessions/:sessionId"
  }
];
const routes = compileRequestLogRoutes(routeDefinitions);

describe("api request logging", () => {
  test("matches exact routes by method and path", () => {
    expect(matchRequestRoute("GET", "/v1beta/sessions", routes)?.id)
      .toBe("listSessions");
    expect(matchRequestRoute("POST", "/v1beta/sessions", routes)?.id)
      .toBe("createSession");
  });

  test("matches parameterized routes", () => {
    expect(matchRequestRoute("GET", "/v1beta/sessions/thread-1", routes))
      .toMatchObject({
        id: "fetchSessionById",
        path: "/v1beta/sessions/:sessionId"
      });
  });

  test("matches trailing slash variants", () => {
    expect(matchRequestRoute("GET", "/v1beta/sessions/", routes)?.id)
      .toBe("listSessions");
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
        ipAddress: "203.0.113.10",
        response
      })
    ).toEqual({
      method: "GET",
      path: "/v1beta/sessions/thread-1",
      route: "/v1beta/sessions/:sessionId",
      routeId: "fetchSessionById",
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
