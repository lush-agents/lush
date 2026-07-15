import { expect, test } from "bun:test";
import {
  byteLength,
  jsonByteLength,
  messageByteSize,
  planSessionTruncation,
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
  expect(sessionSizeLimits.maxProjectContextItemBytes).toBe(256 * 1024);
  expect(sessionSizeLimits.maxProjectContextBytes).toBe(1024 * 1024);
});

test("session titles are derived from first-message content", () => {
  expect(titleFromContent("  hello   there  ")).toBe("hello there");
  expect(titleFromContent("")).toBe("Untitled session");
  expect(titleFromContent("x".repeat(100))).toHaveLength(80);
});

test("session routes use sessions resources and settings namespace", () => {
  const routes = new Set(apiSpec.routes.map((route) => route.path));

  expect(routes.has("/v1beta/sessions")).toBe(true);
  expect(routes.has("/v1beta/sessions/:sessionId/messages")).toBe(true);
  expect(routes.has("/v1beta/sessions/:sessionId/truncate")).toBe(true);
  expect(routes.has("/v1beta/sessions/:sessionId/archive")).toBe(true);
  expect(routes.has("/v1beta/sessions/:sessionId/delete")).toBe(false);
  expect(routes.has("/v1beta/settings/sessions")).toBe(true);
  expect(routes.has("/v1beta/projects")).toBe(true);
  expect(routes.has("/v1beta/sessions/settings")).toBe(false);
});

test("session truncation retains the boundary and removes dependent state", () => {
  const messages = [
    { id: "user-1", byteSize: 10 },
    { id: "assistant-1", byteSize: 20 },
    { id: "user-2", byteSize: 30 },
    { id: "assistant-2", byteSize: 40 }
  ];
  const snapshots = [
    { id: "feedback-1", byteSize: 5, state: { messageId: "assistant-1" } },
    { id: "feedback-2", byteSize: 6, state: { messageId: "assistant-2" } },
    { id: "other", byteSize: 7, state: { panel: "open" } }
  ];

  const retry = planSessionTruncation(messages, snapshots, "user-2");
  expect(retry.retainedMessages.map((message) => message.id)).toEqual([
    "user-1",
    "assistant-1",
    "user-2"
  ]);
  expect(retry.removedMessages.map((message) => message.id)).toEqual([
    "assistant-2"
  ]);
  expect(retry.removedSnapshots.map((snapshot) => snapshot.id)).toEqual([
    "feedback-2"
  ]);
  expect(retry.removedBytes).toBe(46);

  const editFirst = planSessionTruncation(messages, snapshots, null);
  expect(editFirst.removedMessages).toEqual(messages);
  expect(editFirst.removedSnapshots.map((snapshot) => snapshot.id)).toEqual([
    "feedback-1",
    "feedback-2"
  ]);
  expect(editFirst.retainedSnapshots.map((snapshot) => snapshot.id)).toEqual([
    "other"
  ]);
  expect(() => planSessionTruncation(messages, snapshots, "missing"))
    .toThrow("Session message was not found");
});

test("session migration indexes agent and session id lookup", async () => {
  const migration = await Bun.file(
    "packages/db/src/migrations/003_session_agent_id.ts"
  ).text();

  expect(migration).toContain("session_threads_agent_id_id_idx");
  expect(migration).toContain("on session_threads(agent_id, id)");
});
