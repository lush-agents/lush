export const agentTypes = `
export type LushChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type LushChatRequest = {
  modelSelection: string;
  messages: LushChatMessage[];
};
`;

export const agentRoutes = [
  {
    id: "streamLushChat",
    method: "POST",
    path: "/agents/lush/chat",
    requestType: "LushChatRequest",
    responseType: "Response",
    auth: true,
    kind: "stream"
  }
] as const;

export type AgentRoute = (typeof agentRoutes)[number];
