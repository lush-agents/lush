import { expect, test } from "bun:test";
import {
  byteLength,
  jsonByteLength,
  messageByteSize,
  sessionSizeLimits,
  stateSnapshotByteSize,
  titleFromContent
} from "../services/sessions/src/runtime";
import { apiSpec } from "../services/api/src/spec";

test("session state byte accounting uses utf-8 bytes", () => {
  expect(byteLength("abc")).toBe(3);
  expect(byteLength("hi 👋")).toBe(7);
  expect(jsonByteLength({ a: "b" })).toBe(9);
  expect(messageByteSize("hello", { source: "test" })).toBe(
    byteLength("hello") + jsonByteLength({ source: "test" })
  );
  expect(stateSnapshotByteSize({ activeFile: "README.md" })).toBe(
    jsonByteLength({ activeFile: "README.md" })
  );
});

test("session state limits match the product storage contract", () => {
  expect(sessionSizeLimits.maxThreadBytes).toBe(10 * 1024 * 1024);
  expect(sessionSizeLimits.maxMessageContentBytes).toBe(256 * 1024);
  expect(sessionSizeLimits.maxStateSnapshotBytes).toBe(1024 * 1024);
  expect(sessionSizeLimits.maxMetadataBytes).toBe(64 * 1024);
});

test("session titles are derived from first-message content", () => {
  expect(titleFromContent("  hello   there  ")).toBe("hello there");
  expect(titleFromContent("")).toBe("Untitled session");
  expect(titleFromContent("x".repeat(100))).toHaveLength(80);
});

test("session routes use sessions resources and settings namespace", () => {
  const routes = new Set(apiSpec.routes.map((route) => route.path));

  expect(routes.has("/v1beta/sessions")).toBe(true);
  expect(routes.has("/v1beta/sessions/:threadId/messages")).toBe(true);
  expect(routes.has("/v1beta/sessions/:threadId/archive")).toBe(true);
  expect(routes.has("/v1beta/sessions/:threadId/delete")).toBe(false);
  expect(routes.has("/v1beta/settings/sessions")).toBe(true);
  expect(routes.has("/v1beta/sessions/settings")).toBe(false);
});

test("session thread migration indexes agent and session id lookup", async () => {
  const migration = await Bun.file(
    "packages/db/src/migrations/003_session_agent_id.ts"
  ).text();

  expect(migration).toContain("session_threads_agent_id_id_idx");
  expect(migration).toContain("on session_threads(agent_id, id)");
});
