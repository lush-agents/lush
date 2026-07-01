import type { AgentChatMessage } from "./runtime";

export function normalizeAgentChatMessages(
  messages: readonly unknown[]
): AgentChatMessage[] {
  return messages
    .map(normalizeAgentChatMessage)
    .filter((message): message is AgentChatMessage => Boolean(message));
}

function normalizeAgentChatMessage(
  message: unknown
): AgentChatMessage | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }

  const candidate = message as Partial<Record<keyof AgentChatMessage, unknown>>;
  const { role, content } = candidate;

  if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
    return undefined;
  }

  return { role, content };
}
