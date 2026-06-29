import type { InferenceProviderKind } from "@lush/db/schema";
import type { ChatMessage, DiscoveredModel } from "../openai-compatible";

export type ProviderConnection = {
  kind: InferenceProviderKind;
  baseUrl: string;
  apiKey: string;
};

export type StreamProviderChatOptions = ProviderConnection & {
  modelId: string;
  messages: ChatMessage[];
  signal: AbortSignal;
};

export type InferenceProviderAdapter = {
  discoverModels(provider: ProviderConnection): Promise<DiscoveredModel[]>;
  streamChat(options: StreamProviderChatOptions): AsyncGenerator<string>;
};
