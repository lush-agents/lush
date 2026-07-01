import type { AgentChatMessage } from "@lush/api-client";
import type { ChatMessage } from "./types";

export function agentChatDeltaMessages(
  message: Pick<ChatMessage, "role" | "content">
): AgentChatMessage[] {
  return message.role === "user" || message.role === "assistant"
    ? [{ role: message.role, content: message.content }]
    : [];
}
