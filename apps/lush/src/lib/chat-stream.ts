import {
  streamAgentChat,
  streamAgentPrompt,
  type AgentChatMessage,
  type InferenceProviderStatus,
  type SessionMessage
} from "@lush/api-client";
import { readAgentEventStream } from "./agent-message";

export function titleFromContent(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return "Untitled session";
  return normalized.length > 80
    ? `${normalized.slice(0, 77).trimEnd()}...`
    : normalized;
}

export function isRenderableChatMessage(
  message: SessionMessage
): message is SessionMessage & { role: "user" | "assistant" } {
  return message.role === "user" || message.role === "assistant";
}

export async function agentResponseErrorMessage(response: Response) {
  const fallback = `Inference request failed with ${response.status}`;
  const details = await response.text().catch(() => "");
  if (!details) return fallback;

  try {
    const body = JSON.parse(details) as { message?: unknown; error?: unknown };
    if (typeof body.message === "string" && body.message.trim()) {
      return body.message.trim();
    }
    if (typeof body.error === "string" && body.error.trim()) {
      return body.error.trim();
    }
  } catch {
    return details;
  }

  return fallback;
}

export async function generateAndPersistSessionTitle(request: {
  apiBaseUrl: string;
  sessionToken: string | undefined;
  modelSelection: string;
  userContent: string;
  assistantContent: string;
  sessionId: string;
  ensureSession: (force?: boolean) => Promise<string | undefined>;
  onSessionTitleChange: (sessionId: string, title: string) => Promise<void>;
}) {
  const abortController = new AbortController();
  const timeout = window.setTimeout(() => abortController.abort(), 15_000);

  try {
    const messages = sessionTitlePromptMessages(
      request.userContent,
      request.assistantContent
    );
    let token = request.sessionToken ?? (await request.ensureSession());
    let response = await postPrompt(
      request.apiBaseUrl,
      token,
      request.modelSelection,
      messages,
      abortController.signal
    );

    if (response.status === 401) {
      token = await request.ensureSession(true);
      response = await postPrompt(
        request.apiBaseUrl,
        token,
        request.modelSelection,
        messages,
        abortController.signal
      );
    }

    if (!response.ok || !response.body) return;
    let generatedContent = "";
    await readAgentEventStream(response, (event) => {
      if (event.type === "text-delta" && generatedContent.length < 500) {
        generatedContent += event.delta;
      }
    });
    const generatedTitle = normalizeGeneratedSessionTitle(
      generatedContent.slice(0, 500)
    );
    if (generatedTitle) {
      await request.onSessionTitleChange(request.sessionId, generatedTitle);
    }
  } catch {
    return;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function normalizeGeneratedSessionTitle(content: string) {
  const firstLine =
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? "";
  const normalized = firstLine
    .replace(/^[-*\d.)\s]+/, "")
    .replace(/^title\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[`"'\u201c\u201d\u2018\u2019]+/, "")
    .replace(/[`"'\u201c\u201d\u2018\u2019.!?:;,-]+$/, "")
    .trim();

  return normalized.length > 80
    ? `${normalized.slice(0, 77).trimEnd()}...`
    : normalized;
}

export function getModelLabel(
  providers: InferenceProviderStatus[],
  modelSelection: string
) {
  const separatorIndex = modelSelection.indexOf(":");
  if (separatorIndex === -1) return "";

  const providerId = modelSelection.slice(0, separatorIndex);
  const modelId = modelSelection.slice(separatorIndex + 1);
  const provider = providers.find((candidate) => candidate.id === providerId);
  return provider?.models.find((candidate) => candidate.id === modelId)?.label ?? "";
}

export function postSessionChat(
  apiBaseUrl: string,
  sessionToken: string | undefined,
  modelSelection: string,
  sessionId: string,
  messages: AgentChatMessage[],
  signal: AbortSignal
) {
  return streamAgentChat(
    apiBaseUrl,
    "lush",
    sessionToken,
    { sessionId, messages, modelSelection },
    signal
  );
}

function postPrompt(
  apiBaseUrl: string,
  sessionToken: string | undefined,
  modelSelection: string,
  messages: AgentChatMessage[],
  signal: AbortSignal
) {
  return streamAgentPrompt(
    apiBaseUrl,
    "lush",
    sessionToken,
    { messages, modelSelection },
    signal
  );
}

function sessionTitlePromptMessages(
  userContent: string,
  assistantContent: string
): AgentChatMessage[] {
  return [
    {
      role: "user",
      content: [
        "Write a concise title for this chat session.",
        "Use 3 to 6 words.",
        "Return only the title. Do not wrap it in quotes.",
        "",
        `User: ${userContent.slice(0, 2_000)}`,
        `Assistant: ${assistantContent.slice(0, 4_000)}`
      ].join("\n")
    }
  ];
}
