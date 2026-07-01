import { createHash } from "node:crypto";
import type { AgentChatMessage } from "./runtime";

export function mergeAgentSessionMessages(
  persistedMessages: AgentChatMessage[],
  clientMessages: AgentChatMessage[]
) {
  if (persistedMessages.length === 0) {
    return clientMessages;
  }

  if (clientMessages.length === 0) {
    return persistedMessages;
  }

  const persistedHashes = persistedMessages.map(messageHash);
  const clientHashes = clientMessages.map(messageHash);
  const maxOverlap = Math.min(persistedHashes.length, clientHashes.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const persistedStart = persistedHashes.length - overlap;
    const matches = clientHashes
      .slice(0, overlap)
      .every((hash, index) => {
        const persistedIndex = persistedStart + index;
        const clientMessage = clientMessages[index];
        const persistedMessage = persistedMessages[persistedIndex];

        return (
          hash === persistedHashes[persistedIndex] &&
          clientMessage !== undefined &&
          persistedMessage !== undefined &&
          sameMessage(clientMessage, persistedMessage)
        );
      });

    if (matches) {
      return [...persistedMessages, ...clientMessages.slice(overlap)];
    }
  }

  return [...persistedMessages, ...clientMessages];
}

function sameMessage(
  left: AgentChatMessage,
  right: AgentChatMessage
) {
  return left.role === right.role && left.content === right.content;
}

function messageHash(message: AgentChatMessage) {
  return createHash("md5")
    .update(`${message.role.length}:`)
    .update(message.role)
    .update("\0")
    .update(`${message.content.length}:`)
    .update(message.content)
    .digest("hex");
}
