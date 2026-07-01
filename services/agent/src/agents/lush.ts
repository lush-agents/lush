import systemPrompt from "../../agents/lush/system.md" with { type: "text" };

export const lushAgent = {
  id: "lush",
  name: "Lush",
  sessionAgentId: "lush-chat",
  systemPrompt
};
