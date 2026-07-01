import {
  fetchSession,
  SessionStateError
} from "@lush/sessions/runtime";
import {
  getLushAgentMetadata,
  type AgentChatMessage
} from "./runtime";
export { mergeSessionMessages } from "./message-merge";

export type SessionPrincipal = {
  userId: string;
  organizationId: string;
};

export class SessionContextError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

export async function loadLushSessionMessages(
  principal: SessionPrincipal,
  sessionId: string
) {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    throw new SessionContextError(
      "session_required",
      "A session id is required"
    );
  }

  let session: Awaited<ReturnType<typeof fetchSession>>;
  try {
    session = await fetchSession(principal, normalizedSessionId);
  } catch (error) {
    if (error instanceof SessionStateError) {
      throw new SessionContextError(error.code, error.message, error.status);
    }

    throw error;
  }

  const agent = getLushAgentMetadata();
  if (session.agentId !== agent.sessionAgentId) {
    throw new SessionContextError(
      "agent_session_mismatch",
      "Session is not owned by this agent",
      404
    );
  }

  return session.messages
    .filter((message): message is typeof message & AgentChatMessage =>
      message.role === "user" || message.role === "assistant"
    )
    .map(({ role, content }) => ({ role, content }));
}
