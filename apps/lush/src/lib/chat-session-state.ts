import type {
  Session,
  SessionMessage
} from "@lush/api-client";

export function preferNewestSessionSnapshot(
  current: Session | undefined,
  incoming: Session
) {
  return current &&
    current.id === incoming.id &&
    current.messages.length > incoming.messages.length
    ? current
    : incoming;
}

export function appendSessionMessageSnapshot(
  current: Session | undefined,
  sessionId: string,
  message: SessionMessage
) {
  if (!current || current.id !== sessionId) {
    return current;
  }

  if (current.messages.some((candidate) => candidate.id === message.id)) {
    return current;
  }

  return {
    ...current,
    messages: [...current.messages, message],
    stateBytes: current.stateBytes + message.byteSize,
    version: current.version + 1,
    updatedAt: message.createdAt
  };
}
