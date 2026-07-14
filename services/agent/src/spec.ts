export const agentTypes = `
export type AgentChatAttachment = {
  filename: string;
  mediaType: string;
  content: string;
};

export type AgentChatMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: AgentChatAttachment[];
};

export type AgentStreamEvent =
  | { type: "response-start" }
  | { type: "text-delta"; delta: string }
  | { type: "reasoning-delta"; delta: string }
  | {
      type: "tool-input";
      toolCallId: string;
      toolName: string;
      input: unknown;
    }
  | {
      type: "tool-output";
      toolCallId: string;
      toolName: string;
      output?: unknown;
      errorText?: string;
    }
  | { type: "source"; sourceId: string; url: string; title: string }
  | {
      type: "artifact";
      artifactId: string;
      title: string;
      description?: string;
      mediaType: string;
      content?: string;
      url?: string;
    }
  | { type: "response-complete" }
  | { type: "response-error"; message: string };

export type AgentChatRequest = {
  modelSelection: string;
  sessionId: string;
  messages: AgentChatMessage[];
};

export type AgentPromptRequest = {
  modelSelection: string;
  messages: AgentChatMessage[];
};
`;

export const agentRoutes = [
  {
    id: "streamAgentChat",
    method: "POST",
    path: "/agents/:agentSlug/chat",
    requestType: "AgentChatRequest",
    responseType: "Response",
    auth: true,
    kind: "stream"
  },
  {
    id: "streamAgentPrompt",
    method: "POST",
    path: "/agents/:agentSlug/prompt",
    requestType: "AgentPromptRequest",
    responseType: "Response",
    auth: true,
    kind: "stream"
  }
] as const;

export type AgentRoute = (typeof agentRoutes)[number];
