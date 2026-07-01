import {
  fetchAgentSession,
  SessionStateError
} from "@lush/sessions/runtime";
import {
  getLushAgentMetadata,
  type AgentChatMessage
} from "./runtime";
export { mergeAgentSessionMessages } from "./message-merge";

export type AgentSessionPrincipal = {
  userId: string;
  organizationId: string;
};

export class AgentSessionContextError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

export async function loadLushAgentSessionMessages(
  principal: AgentSessionPrincipal,
  sessionId: string
) {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    throw new AgentSessionContextError(
      "session_required",
      "A session id is required"
    );
  }

  let session: Awaited<ReturnType<typeof fetchAgentSession>>;
  try {
    session = await fetchAgentSession(principal, normalizedSessionId);
  } catch (error) {
    if (error instanceof SessionStateError) {
      throw new AgentSessionContextError(error.code, error.message, error.status);
    }

    throw error;
  }

  const agent = getLushAgentMetadata();
  if (session.agentId !== agent.sessionAgentId) {
    throw new AgentSessionContextError(
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
