import { describe, expect, test } from "bun:test";
import { normalizeAgentChatMessages } from "../services/agent/src/chat-request";
import { mergeAgentSessionMessages } from "../services/agent/src/message-merge";
import type { AgentChatMessage } from "../services/agent/src/runtime";

const user = (content: string): AgentChatMessage => ({ role: "user", content });
const assistant = (content: string): AgentChatMessage => ({
  role: "assistant",
  content
});

describe("agent session context merge", () => {
  test("appends only the non-overlapping client suffix", () => {
    const persisted = [user("one"), assistant("two")];
    const client = [user("one"), assistant("two"), user("three")];

    expect(mergeAgentSessionMessages(persisted, client)).toEqual([
      user("one"),
      assistant("two"),
      user("three")
    ]);
  });

  test("deduplicates a one-message client delta already persisted at the session tail", () => {
    const persisted = [user("one"), assistant("two"), user("three")];
    const client = [user("three")];

    expect(mergeAgentSessionMessages(persisted, client)).toEqual([
      user("one"),
      assistant("two"),
      user("three")
    ]);
  });

  test("finds suffix-prefix overlap when persisted has older history", () => {
    const persisted = [user("older"), assistant("one"), user("two")];
    const client = [assistant("one"), user("two"), assistant("three")];

    expect(mergeAgentSessionMessages(persisted, client)).toEqual([
      user("older"),
      assistant("one"),
      user("two"),
      assistant("three")
    ]);
  });

  test("keeps repeated messages when they are not part of the overlap", () => {
    const persisted = [user("repeat"), assistant("ok")];
    const client = [user("repeat"), user("repeat")];

    expect(mergeAgentSessionMessages(persisted, client)).toEqual([
      user("repeat"),
      assistant("ok"),
      user("repeat"),
      user("repeat")
    ]);
  });

  test("falls back to simple concatenation when there is no overlap", () => {
    const persisted = [user("persisted")];
    const client = [assistant("client")];

    expect(mergeAgentSessionMessages(persisted, client)).toEqual([
      user("persisted"),
      assistant("client")
    ]);
  });

  test("handles either side being empty", () => {
    expect(mergeAgentSessionMessages([], [user("client")])).toEqual([
      user("client")
    ]);
    expect(mergeAgentSessionMessages([assistant("persisted")], [])).toEqual([
      assistant("persisted")
    ]);
  });
});

describe("agent chat request normalization", () => {
  test("keeps only user and assistant text messages", () => {
    expect(
      normalizeAgentChatMessages([
        user("hello"),
        assistant("hi"),
        { role: "system", content: "ignored" },
        { role: "tool", content: "ignored" },
        { role: "user", content: 42 },
        { role: "assistant" },
        undefined,
        "not a message"
      ])
    ).toEqual([user("hello"), assistant("hi")]);
  });
});
