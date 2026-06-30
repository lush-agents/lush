import { expect, test } from "bun:test";
import {
  matchWorkspaceSessionPath,
  routes,
  sessionRouteHref
} from "../apps/lush/src/lib/app-data";

test("workspace session routes include the session id", () => {
  const chatRoute = routes.find((route) => route.href === "/chat");

  expect(chatRoute).toBeDefined();
  expect(sessionRouteHref(chatRoute!, "session-123")).toBe(
    "/chat/sessions/session-123"
  );
  expect(
    sessionRouteHref(chatRoute!, "session with spaces")
  ).toBe("/chat/sessions/session%20with%20spaces");
});

test("workspace session route matching resolves route metadata and id", () => {
  const match = matchWorkspaceSessionPath("/chat/sessions/session-123");

  expect(match?.route.href).toBe("/chat");
  expect(match?.sessionId).toBe("session-123");
  expect(matchWorkspaceSessionPath("/chat/sessions")).toBeUndefined();
  expect(matchWorkspaceSessionPath("/chat/sessions/one/two")).toBeUndefined();
  expect(matchWorkspaceSessionPath("/settings/profile")).toBeUndefined();
});
