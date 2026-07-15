import {
  discoverOpenAIModels,
  streamOpenAIResponses
} from "../openai-responses";
import type {
  InferenceProviderAdapter,
  ProviderConnection,
  StreamProviderChatOptions
} from "./types";

export const openAIAdapter: InferenceProviderAdapter = {
  discoverModels(provider: ProviderConnection) {
    return discoverOpenAIModels(provider);
  },

  streamChat(options: StreamProviderChatOptions) {
    return streamOpenAIResponses(
      {
        endpoint: `${options.baseUrl}/responses`,
        apiKey: options.apiKey,
        model: options.modelId
      },
      options.messages,
      options.signal
    );
  }
};
