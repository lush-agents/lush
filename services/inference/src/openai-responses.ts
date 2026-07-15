import type { ChatMessage, DiscoveredModel } from "./openai-compatible";
import { discoverOpenAICompatibleModels } from "./openai-compatible";

export type OpenAIResponsesConfig = {
  endpoint: string;
  apiKey: string;
  model: string;
};

export async function* streamOpenAIResponses(
  config: OpenAIResponsesConfig,
  messages: ChatMessage[],
  signal: AbortSignal
): AsyncGenerator<string> {
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      accept: "text/event-stream",
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(openAIResponsesRequest(config.model, messages)),
    signal
  });

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Provider request failed with ${response.status}: ${body || response.statusText}`
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const delta = parseOpenAIResponseStreamLine(line);
      if (delta) yield delta;
    }

    if (done) break;
  }

  if (buffer) {
    const delta = parseOpenAIResponseStreamLine(buffer);
    if (delta) yield delta;
  }
}

export function openAIResponsesRequest(model: string, messages: ChatMessage[]) {
  const instructions = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const input = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role,
      content: message.content
    }));

  return {
    model,
    ...(instructions ? { instructions } : {}),
    input,
    stream: true,
    store: false
  };
}

export function parseOpenAIResponseStreamLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return "";

  const data = trimmed.slice("data:".length).trim();
  if (!data || data === "[DONE]") return "";

  let event: unknown;
  try {
    event = JSON.parse(data);
  } catch {
    return "";
  }
  if (!event || typeof event !== "object") return "";

  const candidate = event as {
    type?: unknown;
    delta?: unknown;
    message?: unknown;
    error?: { message?: unknown };
    response?: { error?: { message?: unknown } };
  };
  if (
    candidate.type === "response.output_text.delta" &&
    typeof candidate.delta === "string"
  ) {
    return candidate.delta;
  }
  if (candidate.type === "error") {
    throw new Error(
      typeof candidate.message === "string"
        ? candidate.message
        : typeof candidate.error?.message === "string"
          ? candidate.error.message
          : "OpenAI response stream failed"
    );
  }
  if (candidate.type === "response.failed") {
    throw new Error(
      typeof candidate.response?.error?.message === "string"
        ? candidate.response.error.message
        : "OpenAI response failed"
    );
  }
  return "";
}

export function discoverOpenAIModels(provider: {
  baseUrl: string;
  apiKey: string;
}): Promise<DiscoveredModel[]> {
  return discoverOpenAICompatibleModels(provider);
}
