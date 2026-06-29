export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ProviderConfig = {
  provider: string;
  endpoint: string;
  apiKey?: string;
  model: string;
};

type ProviderId = "fireworks" | "baseten";

type ModelSelection = {
  provider: ProviderId;
  model: string;
};

const providerCatalog: Array<{
  id: ProviderId;
  label: string;
  endpoint: string;
  models: Array<{
    id: string;
    label: string;
  }>;
}> = [
  {
    id: "fireworks",
    label: "Fireworks",
    endpoint: "https://api.fireworks.ai/inference/v1/chat/completions",
    models: [
      {
        id: "glm-5.2",
        label: "GLM 5.2"
      },
      {
        id: "accounts/fireworks/models/deepseek-v3",
        label: "DeepSeek V3"
      },
      {
        id: "accounts/fireworks/models/qwen3-235b-a22b",
        label: "Qwen3 235B A22B"
      }
    ]
  },
  {
    id: "baseten",
    label: "Baseten",
    endpoint: "https://inference.baseten.co/v1/chat/completions",
    models: [
      {
        id: "glm-5.2",
        label: "GLM 5.2"
      },
      {
        id: "deepseek-v3",
        label: "DeepSeek V3"
      },
      {
        id: "qwen3-coder",
        label: "Qwen3 Coder"
      }
    ]
  }
];

export function getProviderConfig(selection?: string): ProviderConfig {
  const parsedSelection = parseModelSelection(selection);
  const provider = parsedSelection?.provider ?? getDefaultProvider();
  const endpoint =
    process.env.LUSH_INFERENCE_ENDPOINT ??
    providerCatalog.find((candidate) => candidate.id === provider)?.endpoint ??
    providerCatalog[0].endpoint;

  return {
    provider,
    endpoint,
    apiKey: getProviderApiKey(provider),
    model: parsedSelection?.model ?? process.env.LUSH_INFERENCE_MODEL ?? "glm-5.2"
  };
}

export function getProviderStatus() {
  return {
    providers: providerCatalog.map((provider) => ({
      id: provider.id,
      label: provider.label,
      configured: Boolean(getProviderApiKey(provider.id)),
      endpoint:
        process.env.LUSH_INFERENCE_ENDPOINT && provider.id === getDefaultProvider()
          ? process.env.LUSH_INFERENCE_ENDPOINT
          : provider.endpoint,
      models: provider.models
    }))
  };
}

export async function* streamOpenAICompatibleChat(
  config: ProviderConfig,
  messages: ChatMessage[],
  signal: AbortSignal
): AsyncGenerator<string> {
  if (!config.apiKey) {
    yield* streamDevelopmentFallback(messages, signal);
    return;
  }

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      temperature: 0.7
    }),
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
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const chunk = parseStreamLine(line);
      if (chunk) {
        yield chunk;
      }
    }
  }
}

function getDefaultProvider(): ProviderId {
  return process.env.LUSH_INFERENCE_PROVIDER === "baseten"
    ? "baseten"
    : "fireworks";
}

function getProviderApiKey(provider: ProviderId) {
  if (provider === "fireworks") {
    return (
      process.env.FIREWORKS_API_KEY ??
      (getDefaultProvider() === "fireworks"
        ? process.env.LUSH_INFERENCE_API_KEY
        : undefined)
    );
  }

  return (
    process.env.BASETEN_API_KEY ??
    (getDefaultProvider() === "baseten"
      ? process.env.LUSH_INFERENCE_API_KEY
      : undefined)
  );
}

function parseModelSelection(selection?: string): ModelSelection | undefined {
  if (!selection) {
    return undefined;
  }

  const [provider, ...modelParts] = selection.split(":");
  const model = modelParts.join(":");

  if ((provider !== "fireworks" && provider !== "baseten") || !model) {
    return undefined;
  }

  const providerConfig = providerCatalog.find((candidate) => candidate.id === provider);
  if (!providerConfig?.models.some((candidate) => candidate.id === model)) {
    return undefined;
  }

  return {
    provider,
    model
  };
}

function parseStreamLine(line: string) {
  const trimmed = line.trim();

  if (!trimmed || !trimmed.startsWith("data:")) {
    return "";
  }

  const data = trimmed.slice("data:".length).trim();

  if (data === "[DONE]") {
    return "";
  }

  try {
    const parsed = JSON.parse(data);
    return parsed.choices?.[0]?.delta?.content ?? "";
  } catch {
    return "";
  }
}

async function* streamDevelopmentFallback(
  messages: ChatMessage[],
  signal: AbortSignal
) {
  const lastUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.content ??
    "";
  const text = [
    "I am running in local development fallback mode because no provider API key is configured.",
    "",
    "The Lush inference service is wired for streaming chat. Configure `LUSH_INFERENCE_API_KEY` and `LUSH_INFERENCE_ENDPOINT` to call the model provider directly.",
    "",
    lastUserMessage ? `You said: ${lastUserMessage}` : ""
  ].join("\n");

  for (const token of text.split(/(\s+)/)) {
    if (signal.aborted) {
      return;
    }

    yield token;
    await Bun.sleep(18);
  }
}
