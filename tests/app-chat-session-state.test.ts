import { describe, expect, test } from "bun:test";
import {
  appendSessionMessageSnapshot,
  preferNewestSessionSnapshot
} from "../apps/lush/src/lib/chat-session-state";
import type {
  Session,
  SessionMessage
} from "../packages/api-client/src/generated";

function session(id: string, messages: SessionMessage[]): Session {
  return {
    id,
    organizationId: "org-1",
    ownerUserId: "user-1",
    title: "Test session",
    agentId: "lush-chat",
    stateBytes: messages.reduce((sum, message) => sum + message.byteSize, 0),
    version: messages.length + 1,
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: messages.at(-1)?.createdAt ?? "2026-06-30T00:00:00.000Z",
    archivedAt: null,
    messages,
    stateSnapshots: []
  };
}

function message(
  id: string,
  role: "user" | "assistant",
  content: string
): SessionMessage {
  return {
    id,
    sessionId: "session-1",
    role,
    content,
    metadata: {},
    tokenCount: null,
    byteSize: content.length,
    createdAt: `2026-06-30T00:00:0${id.slice(-1)}.000Z`
  };
}

describe("app chat session state", () => {
  test("keeps optimistic first-turn messages over a stale fetched session snapshot", () => {
    const userMessage = message("message-1", "user", "How many years?");
    const assistantMessage = message("message-2", "assistant", "About five.");
    const optimistic = session("session-1", [userMessage, assistantMessage]);
    const staleFetch = session("session-1", []);

    expect(preferNewestSessionSnapshot(optimistic, staleFetch)).toBe(
      optimistic
    );
  });

  test("accepts a fetched session snapshot when it has at least as much history", () => {
    const userMessage = message("message-1", "user", "How many years?");
    const current = session("session-1", []);
    const fetched = session("session-1", [userMessage]);

    expect(preferNewestSessionSnapshot(current, fetched)).toBe(fetched);
  });

  test("appends persisted first-turn messages to the active session once", () => {
    const active = session("session-1", []);
    const userMessage = message("message-1", "user", "How many years?");

    const withMessage = appendSessionMessageSnapshot(
      active,
      "session-1",
      userMessage
    );
    const duplicate = appendSessionMessageSnapshot(
      withMessage,
      "session-1",
      userMessage
    );

    expect(withMessage?.messages).toEqual([userMessage]);
    expect(duplicate?.messages).toEqual([userMessage]);
  });
});
