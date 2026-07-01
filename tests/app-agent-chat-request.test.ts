import { describe, expect, test } from "bun:test";
import { agentChatDeltaMessages } from "../apps/lush/src/lib/agent-chat-request";

describe("app agent chat request", () => {
  test("sends only the new chat message as the client delta", () => {
    expect(
      agentChatDeltaMessages({
        role: "user",
        content: "new turn"
      })
    ).toEqual([
      {
        role: "user",
        content: "new turn"
      }
    ]);
  });

  test("does not include non-agent message roles in the delta", () => {
    expect(
      agentChatDeltaMessages({
        role: "system",
        content: "internal"
      })
    ).toEqual([]);
  });
});
