import type { ChatMessage } from "./types";
import { agentChatMessage } from "./agent-message";

export function agentChatDeltaMessages(
  message: ChatMessage
) {
  return message.role === "user" || message.role === "assistant"
    ? [agentChatMessage(message)]
    : [];
}
