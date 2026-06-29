export const agentTypes = `
export type AgentChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AgentChatRequest = {
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
  }
] as const;

export type AgentRoute = (typeof agentRoutes)[number];
