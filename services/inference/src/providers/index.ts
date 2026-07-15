import type { InferenceProviderKind } from "@lush/db/schema";
import { anthropicAdapter } from "./anthropic";
import { openAIAdapter } from "./openai";
import { openAICompatibleAdapter } from "./openai-compatible";
import type { InferenceProviderAdapter } from "./types";

const adapters: Record<InferenceProviderKind, InferenceProviderAdapter> = {
  anthropic: anthropicAdapter,
  baseten: openAICompatibleAdapter,
  fireworks: openAICompatibleAdapter,
  openai: openAIAdapter,
  "openai-compatible": openAICompatibleAdapter
};

export function adapterForProvider(kind: InferenceProviderKind) {
  return adapters[kind];
}

export type {
  InferenceProviderAdapter,
  ProviderConnection,
  StreamProviderChatOptions
} from "./types";
