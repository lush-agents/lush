import {
  discoverOpenAICompatibleModels,
  streamOpenAICompatibleChat
} from "../openai-compatible";
import type {
  InferenceProviderAdapter,
  ProviderConnection,
  StreamProviderChatOptions
} from "./types";

export const openAICompatibleAdapter: InferenceProviderAdapter = {
  discoverModels(provider: ProviderConnection) {
    return discoverOpenAICompatibleModels(provider);
  },

  streamChat(options: StreamProviderChatOptions) {
    return streamOpenAICompatibleChat(
      {
        endpoint: `${options.baseUrl}/chat/completions`,
        apiKey: options.apiKey,
        model: options.modelId
      },
      options.messages,
      options.signal
    );
  }
};
