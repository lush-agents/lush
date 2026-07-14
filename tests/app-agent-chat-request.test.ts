import { describe, expect, test } from "bun:test";
import { agentChatDeltaMessages } from "../apps/lush/src/lib/agent-chat-request";

describe("app agent chat request", () => {
  test("sends only the new chat message as the client delta", () => {
    expect(
      agentChatDeltaMessages({
        id: "message-1",
        role: "user",
        parts: [{ type: "text", text: "new turn" }]
      })
    ).toEqual([
      {
        role: "user",
        content: "new turn",
        attachments: []
      }
    ]);
  });

  test("does not include non-agent message roles in the delta", () => {
    expect(
      agentChatDeltaMessages({
        id: "message-2",
        role: "system",
        parts: [{ type: "text", text: "internal" }]
      } as never)
    ).toEqual([]);
  });
});
