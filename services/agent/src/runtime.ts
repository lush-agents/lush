import {
  streamInferenceChat,
  type InferenceChatMessage
} from "@lush/inference/runtime";
import { lushAgent } from "./agents/lush";

export type AgentChatMessage = InferenceChatMessage;

export type StreamLushAgentChatOptions = {
  organizationId: string;
  modelSelection?: string;
  messages: AgentChatMessage[];
  signal: AbortSignal;
};

export function getLushAgentMetadata() {
  return {
    id: lushAgent.id,
    name: lushAgent.name
  };
}

export async function* streamLushAgentChat({
  organizationId,
  modelSelection,
  messages,
  signal
}: StreamLushAgentChatOptions) {
  yield* streamInferenceChat({
    organizationId,
    modelSelection,
    systemPrompt: lushAgent.systemPrompt,
    messages,
    signal
  });
}
