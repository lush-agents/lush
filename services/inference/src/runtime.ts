import {
  getProviderConfig,
  streamOpenAICompatibleChat,
  type ProviderConfig
} from "./openai-compatible";

export type InferenceChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type InferenceProviderKind =
  | "baseten"
  | "fireworks"
  | "anthropic"
  | "openai"
  | "openai-compatible";

export type WorkspaceMode = "chat" | "code" | "work" | "agents";

export type ModelDefaults = Record<WorkspaceMode, string>;

export type InferenceProviderRequest = {
  kind: InferenceProviderKind;
  label: string;
  apiKey: string;
  baseUrl?: string;
};

export type ConnectedProvider = {
  id: string;
  kind: InferenceProviderKind;
  label: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  models: Array<{
    id: string;
    label: string;
    enabled: boolean;
  }>;
};

export type ConnectedModel = {
  provider: ConnectedProvider;
  modelId: string;
};

export type StreamInferenceChatOptions = {
  organizationId: string;
  modelSelection?: string;
  systemPrompt: string;
  messages: InferenceChatMessage[];
  signal: AbortSignal;
};

const organizationProviders = new Map<string, ConnectedProvider[]>();
const organizationModelDefaults = new Map<string, ModelDefaults>();
const workspaceModes: WorkspaceMode[] = ["chat", "code", "work", "agents"];
const emptyModelDefaults: ModelDefaults = {
  chat: "",
  code: "",
  work: "",
  agents: ""
};

const providerBaseUrls: Record<InferenceProviderKind, string> = {
  baseten: "https://inference.baseten.co/v1",
  fireworks: "https://api.fireworks.ai/inference/v1",
  anthropic: "https://api.anthropic.com/v1",
  openai: "https://api.openai.com/v1",
  "openai-compatible": ""
};

export function getInferenceConfig(organizationId: string) {
  const providers = organizationProviders.get(organizationId) ?? [];
  const modelDefaults = reconcileModelDefaults(
    organizationId,
    getOrganizationModelDefaults(organizationId),
    providers
  );

  return {
    organizationId,
    modelDefaults,
    providers: providers.map(sanitizeProvider)
  };
}

export async function createInferenceProvider(
  organizationId: string,
  request: InferenceProviderRequest
) {
  const normalized = normalizeProviderRequest(request);
  if (!normalized) {
    throw new InferenceError("invalid_provider", "Invalid provider request");
  }

  const models = await discoverModels(normalized);
  const provider: ConnectedProvider = {
    id: crypto.randomUUID(),
    kind: normalized.kind,
    label: normalized.label,
    baseUrl: normalized.baseUrl,
    apiKey: normalized.apiKey,
    enabled: true,
    models
  };
  const providers = organizationProviders.get(organizationId) ?? [];
  providers.push(provider);
  organizationProviders.set(organizationId, providers);

  return sanitizeProvider(provider);
}

export function updateInferenceProvider(
  organizationId: string,
  request: unknown
) {
  if (!isProviderUpdateRequest(request)) {
    throw new InferenceError("invalid_provider_update", "Invalid provider update");
  }

  const provider = findProvider(organizationId, request.providerId);
  provider.enabled = request.enabled;
  return getInferenceConfig(organizationId);
}

export function updateInferenceModel(
  organizationId: string,
  request: unknown
) {
  if (!isModelUpdateRequest(request)) {
    throw new InferenceError("invalid_model_update", "Invalid model update");
  }

  const provider = findProvider(organizationId, request.providerId);
  const model = provider.models.find((candidate) => candidate.id === request.modelId);
  if (!model) {
    throw new InferenceError("model_not_found", "Model was not found");
  }

  model.enabled = request.enabled;
  return getInferenceConfig(organizationId);
}

export function updateInferenceModelDefault(
  organizationId: string,
  request: unknown
) {
  if (!isModelDefaultUpdateRequest(request)) {
    throw new InferenceError(
      "invalid_model_default_update",
      "Invalid model default update"
    );
  }

  const providers = organizationProviders.get(organizationId) ?? [];
  if (
    request.modelSelection &&
    !getAvailableModelSelections(providers).includes(request.modelSelection)
  ) {
    throw new InferenceError("model_not_enabled", "Model is not enabled");
  }

  const current = getOrganizationModelDefaults(organizationId);
  const next = {
    ...current,
    [request.mode]: request.modelSelection
  };
  organizationModelDefaults.set(organizationId, next);

  return getInferenceConfig(organizationId);
}

export function deleteInferenceProvider(
  organizationId: string,
  request: unknown
) {
  if (!isProviderDeleteRequest(request)) {
    throw new InferenceError("invalid_provider_delete", "Invalid provider delete");
  }

  const providers = organizationProviders.get(organizationId) ?? [];
  const nextProviders = providers.filter(
    (provider) => provider.id !== request.providerId
  );

  if (nextProviders.length === providers.length) {
    throw new InferenceError("provider_not_found", "Provider was not found");
  }

  organizationProviders.set(organizationId, nextProviders);
  return getInferenceConfig(organizationId);
}

export function resolveConnectedModel(
  organizationId: string,
  modelSelection?: string
): ConnectedModel | undefined {
  if (!modelSelection) {
    return undefined;
  }

  const separatorIndex = modelSelection.indexOf(":");
  if (separatorIndex === -1) {
    return undefined;
  }

  const providerId = modelSelection.slice(0, separatorIndex);
  const modelId = modelSelection.slice(separatorIndex + 1);
  const provider = (organizationProviders.get(organizationId) ?? []).find(
    (candidate) => candidate.id === providerId
  );

  if (!provider?.enabled) {
    return undefined;
  }

  if (!provider.models.some((model) => model.id === modelId && model.enabled)) {
    return undefined;
  }

  return {
    provider,
    modelId
  };
}

export function getConnectedProviderConfig(selection: ConnectedModel): ProviderConfig {
  return {
    provider: selection.provider.kind,
    endpoint: `${selection.provider.baseUrl}/chat/completions`,
    apiKey: selection.provider.apiKey,
    model: selection.modelId
  };
}

export async function* streamInferenceChat({
  organizationId,
  modelSelection,
  systemPrompt,
  messages,
  signal
}: StreamInferenceChatOptions) {
  const connectedModel = resolveConnectedModel(organizationId, modelSelection);

  if (connectedModel?.provider.kind === "anthropic") {
    yield* streamAnthropicChat(
      connectedModel.provider,
      systemPrompt,
      connectedModel.modelId,
      messages,
      signal
    );
    return;
  }

  const config = connectedModel
    ? getConnectedProviderConfig(connectedModel)
    : getProviderConfig(modelSelection);

  yield* streamOpenAICompatibleChat(
    config,
    [
      {
        role: "system",
        content: systemPrompt
      },
      ...messages
    ],
    signal
  );
}

export async function* streamAnthropicChat(
  provider: ConnectedProvider,
  systemPrompt: string,
  modelId: string,
  messages: InferenceChatMessage[],
  signal: AbortSignal
) {
  const response = await fetch(`${provider.baseUrl}/messages`, {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": provider.apiKey
    },
    body: JSON.stringify({
      model: modelId,
      system: systemPrompt,
      messages,
      max_tokens: 4096,
      stream: true
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
      const chunk = parseAnthropicStreamLine(line);
      if (chunk) {
        yield chunk;
      }
    }
  }
}

export class InferenceError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

function normalizeProviderRequest(request: InferenceProviderRequest) {
  const resolvedBaseUrl =
    request.baseUrl && request.baseUrl.trim()
      ? request.baseUrl.trim()
      : providerBaseUrls[request.kind];

  if (
    !request.label.trim() ||
    !request.apiKey.trim() ||
    !resolvedBaseUrl
  ) {
    return undefined;
  }

  return {
    kind: request.kind,
    label: request.label.trim(),
    apiKey: request.apiKey.trim(),
    baseUrl: trimTrailingSlash(resolvedBaseUrl)
  };
}

async function discoverModels(provider: {
  kind: InferenceProviderKind;
  baseUrl: string;
  apiKey: string;
}) {
  const response =
    provider.kind === "anthropic"
      ? await fetch(`${provider.baseUrl}/models`, {
          headers: {
            "anthropic-version": "2023-06-01",
            "x-api-key": provider.apiKey
          }
        })
      : await fetch(`${provider.baseUrl}/models`, {
          headers: {
            authorization: `Bearer ${provider.apiKey}`
          }
        });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new InferenceError(
      "model_discovery_failed",
      `Model discovery failed with ${response.status}: ${text || response.statusText}`
    );
  }

  const body = await response.json().catch(() => undefined);
  const data =
    body && typeof body === "object" && Array.isArray((body as { data?: unknown }).data)
      ? (body as { data: unknown[] }).data
      : [];
  const models = data
    .map((model) => normalizeDiscoveredModel(model))
    .filter(
      (model): model is { id: string; label: string; enabled: boolean } =>
        Boolean(model)
    );

  if (models.length === 0) {
    throw new InferenceError(
      "model_discovery_failed",
      "No models were returned by the provider."
    );
  }

  const likelyChatModels = models.filter((model) => isLikelyChatModel(model.id));
  return likelyChatModels.length > 0 ? likelyChatModels : models;
}

function normalizeDiscoveredModel(model: unknown) {
  if (!model || typeof model !== "object") {
    return undefined;
  }

  const candidate = model as Record<string, unknown>;
  const id = candidate.id;
  if (typeof id !== "string" || !id) {
    return undefined;
  }

  const label =
    typeof candidate.display_name === "string"
      ? candidate.display_name
      : typeof candidate.name === "string"
        ? candidate.name
        : id;

  return {
    id,
    label,
    enabled: false
  };
}

function isLikelyChatModel(id: string) {
  return /chat|gpt|o\d|claude|llama|qwen|deepseek|glm|mistral|mixtral|sonnet|haiku|opus/i.test(
    id
  );
}

function sanitizeProvider(provider: ConnectedProvider) {
  return {
    id: provider.id,
    kind: provider.kind,
    label: provider.label,
    configured: true,
    enabled: provider.enabled,
    baseUrl: provider.baseUrl,
    models: provider.models
  };
}

function getOrganizationModelDefaults(organizationId: string): ModelDefaults {
  return {
    ...emptyModelDefaults,
    ...(organizationModelDefaults.get(organizationId) ?? {})
  };
}

function reconcileModelDefaults(
  organizationId: string,
  defaults: ModelDefaults,
  providers: ConnectedProvider[]
) {
  const availableSelections = getAvailableModelSelections(providers);
  const availableSelectionSet = new Set(availableSelections);
  const fallbackSelection = availableSelections[0] ?? "";
  const next = { ...defaults };
  let changed = false;

  for (const mode of workspaceModes) {
    const selection = next[mode];
    if (
      (selection && !availableSelectionSet.has(selection)) ||
      (!selection && fallbackSelection)
    ) {
      next[mode] = fallbackSelection;
      changed = true;
    }
  }

  if (changed) {
    organizationModelDefaults.set(organizationId, next);
  }

  return next;
}

function getAvailableModelSelections(providers: ConnectedProvider[]) {
  return providers.flatMap((provider) =>
    provider.enabled
      ? provider.models
          .filter((model) => model.enabled)
          .map((model) => `${provider.id}:${model.id}`)
      : []
  );
}

function findProvider(organizationId: string, providerId: string) {
  const provider = (organizationProviders.get(organizationId) ?? []).find(
    (candidate) => candidate.id === providerId
  );

  if (!provider) {
    throw new InferenceError("provider_not_found", "Provider was not found");
  }

  return provider;
}

function isProviderUpdateRequest(
  request: unknown
): request is { providerId: string; enabled: boolean } {
  return (
    Boolean(request) &&
    typeof request === "object" &&
    typeof (request as { providerId?: unknown }).providerId === "string" &&
    typeof (request as { enabled?: unknown }).enabled === "boolean"
  );
}

function isModelUpdateRequest(
  request: unknown
): request is { providerId: string; modelId: string; enabled: boolean } {
  return (
    Boolean(request) &&
    typeof request === "object" &&
    typeof (request as { providerId?: unknown }).providerId === "string" &&
    typeof (request as { modelId?: unknown }).modelId === "string" &&
    typeof (request as { enabled?: unknown }).enabled === "boolean"
  );
}

function isProviderDeleteRequest(
  request: unknown
): request is { providerId: string } {
  return (
    Boolean(request) &&
    typeof request === "object" &&
    typeof (request as { providerId?: unknown }).providerId === "string"
  );
}

function isModelDefaultUpdateRequest(
  request: unknown
): request is { mode: WorkspaceMode; modelSelection: string } {
  return (
    Boolean(request) &&
    typeof request === "object" &&
    workspaceModes.includes((request as { mode?: WorkspaceMode }).mode as WorkspaceMode) &&
    typeof (request as { modelSelection?: unknown }).modelSelection === "string"
  );
}

function parseAnthropicStreamLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    return "";
  }

  try {
    const parsed = JSON.parse(trimmed.slice("data:".length).trim());
    return parsed.type === "content_block_delta" ? parsed.delta?.text ?? "" : "";
  } catch {
    return "";
  }
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
