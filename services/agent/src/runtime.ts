import {
  streamInferenceChat,
  type InferenceChatMessage
} from "@lush/inference/runtime";
import { lushAgent } from "./agents/lush";

export type AgentChatAttachment = {
  filename: string;
  mediaType: string;
  content: string;
};

export type AgentChatMessage = InferenceChatMessage & {
  attachments?: AgentChatAttachment[];
};

export type StreamLushAgentChatOptions = {
  organizationId: string;
  modelSelection?: string;
  messages: AgentChatMessage[];
  signal: AbortSignal;
};

export function getLushAgentMetadata() {
  return {
    id: lushAgent.id,
    name: lushAgent.name,
    sessionAgentId: lushAgent.sessionAgentId
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
    messages: messages.map(toInferenceMessage),
    signal
  });
}

function toInferenceMessage(message: AgentChatMessage): InferenceChatMessage {
  if (!message.attachments?.length) return message;

  const attachmentContext = message.attachments
    .map(
      (attachment) =>
        `<file name=${JSON.stringify(attachment.filename)} media-type=${JSON.stringify(attachment.mediaType)}>\n${attachment.content}\n</file>`
    )
    .join("\n\n");

  return {
    role: message.role,
    content: `${message.content}\n\n<attachments>\n${attachmentContext}\n</attachments>`
  };
}
