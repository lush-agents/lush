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
  const { role, content, attachments } = candidate;

  if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
    return undefined;
  }

  return {
    role,
    content,
    attachments: normalizeAttachments(attachments)
  };
}

function normalizeAttachments(value: unknown) {
  if (!Array.isArray(value)) return undefined;

  const attachments = value.flatMap((attachment) => {
    if (!attachment || typeof attachment !== "object") return [];
    const candidate = attachment as Record<string, unknown>;
    return typeof candidate.filename === "string" &&
      typeof candidate.mediaType === "string" &&
      typeof candidate.content === "string"
      ? [{
          filename: candidate.filename.slice(0, 255),
          mediaType: candidate.mediaType.slice(0, 127),
          content: candidate.content.slice(0, 48 * 1024)
        }]
      : [];
  });

  let totalBytes = 0;
  const bounded = attachments.slice(0, 4).filter((attachment) => {
    const bytes = new TextEncoder().encode(attachment.content).byteLength;
    if (totalBytes + bytes > 48 * 1024) return false;
    totalBytes += bytes;
    return true;
  });

  return bounded.length > 0 ? bounded : undefined;
}
