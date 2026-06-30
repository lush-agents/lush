import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show
} from "solid-js";
import {
  streamAgentChat,
  type AgentChatMessage,
  type InferenceProviderStatus,
  type SessionMessage,
  type SessionThread,
  type UserRole,
} from "@lush/api-client";
import logoUrl from "../../assets/lush-logo.svg?url";
import { createId, getFirstName } from "../../lib/app-data";
import type { ChatMessage } from "../../lib/types";
import { Dropdown } from "../../ui/Dropdown";
import {
  AssistantMessageContent,
  Message,
  MessageContent
} from "../../ui/Message";
import { MessageScroller } from "../../ui/MessageScroller";

const suggestionPrompts = [
  {
    prompt: "Review a design doc",
    mode: "Work",
    integrations: ["Drive", "GitHub"]
  },
  {
    prompt: "Add docstrings to a file",
    mode: "Code",
    integrations: ["GitHub"]
  },
  {
    prompt: "Think through an architecture decision",
    mode: "Chat",
    integrations: []
  }
];

function getGreeting(date: Date) {
  const hour = date.getHours();

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 17) {
    return "Good afternoon";
  }

  return "Good evening";
}

export function ChatPage(props: {
  displayName: string;
  apiBaseUrl: string;
  defaultModelSelection: string;
  providers: InferenceProviderStatus[];
  currentRole?: UserRole;
  thread?: SessionThread;
  sessionKey: number;
  ensureSession: (force?: boolean) => Promise<string | undefined>;
  onCreateSession: (request: { title: string }) => Promise<string>;
  onAppendSessionMessage: (
    threadId: string,
    message: {
      role: "user" | "assistant";
      content: string;
      metadata?: unknown;
    }
  ) => Promise<void>;
  onSessionTitleChange: (threadId: string, title: string) => Promise<void>;
  onNavigate: (href: string) => void;
}) {
  let transcriptRef: HTMLDivElement | undefined;
  let inputRef: HTMLTextAreaElement | undefined;
  let abortController: AbortController | undefined;
  let syncedSessionKey: number | undefined;

  const [now, setNow] = createSignal(new Date());
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [input, setInput] = createSignal("");
  const [isStreaming, setIsStreaming] = createSignal(false);
  const [isFollowing, setIsFollowing] = createSignal(true);
  const [newContentOffscreen, setNewContentOffscreen] = createSignal(false);
  const [error, setError] = createSignal("");
  const [modelMenuOpen, setModelMenuOpen] = createSignal(false);
  const [selectedModelSelection, setSelectedModelSelection] = createSignal("");
  const [activeThreadId, setActiveThreadId] = createSignal<string>();
  const greeting = createMemo(
    () => `${getGreeting(now())}, ${getFirstName(props.displayName)}`
  );
  const hasMessages = createMemo(() => messages().length > 0);
  const enabledModelSelections = createMemo(() =>
    props.providers.flatMap((provider) =>
      provider.models.map((model) => `${provider.id}:${model.id}`)
    )
  );
  const activeModelSelection = createMemo(() => {
    const selected = selectedModelSelection();
    if (selected && enabledModelSelections().includes(selected)) {
      return selected;
    }

    if (
      props.defaultModelSelection &&
      enabledModelSelections().includes(props.defaultModelSelection)
    ) {
      return props.defaultModelSelection;
    }

    return enabledModelSelections()[0] ?? "";
  });
  const activeModelLabel = createMemo(() =>
    getModelLabel(props.providers, activeModelSelection())
  );

  createEffect(() => {
    if (!selectedModelSelection() && props.defaultModelSelection) {
      setSelectedModelSelection(props.defaultModelSelection);
    }
  });

  createEffect(() => {
    const thread = props.thread;
    const sessionKey = props.sessionKey;
    if (isStreaming() || sessionKey === syncedSessionKey) {
      return;
    }

    syncedSessionKey = sessionKey;
    setActiveThreadId(thread?.id);
    setMessages(
      (thread?.messages ?? [])
        .filter(isRenderableChatMessage)
        .map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          status: "complete" as const
        }))
    );
    setError("");
  });

  const resizeInput = () => {
    const inputElement = inputRef;
    if (!inputElement) {
      return;
    }

    const maxHeight = 144;
    inputElement.style.height = "auto";
    inputElement.style.height = `${Math.min(
      inputElement.scrollHeight,
      maxHeight
    )}px`;
    inputElement.style.overflowY =
      inputElement.scrollHeight > maxHeight ? "auto" : "hidden";
  };

  const stopFollowing = () => {
    if (isStreaming()) {
      setIsFollowing(false);
    }
  };

  const handleSelectionChange = () => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      stopFollowing();
    }
  };

  const handleDocumentKeyDown = (event: KeyboardEvent) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.key === "PageUp" ||
      event.key === "PageDown" ||
      event.key === "Home" ||
      event.key === "End"
    ) {
      stopFollowing();
    }
  };

  document.addEventListener("selectionchange", handleSelectionChange);
  document.addEventListener("keydown", handleDocumentKeyDown);
  const clockInterval = window.setInterval(() => setNow(new Date()), 60_000);
  onCleanup(() => {
    document.removeEventListener("selectionchange", handleSelectionChange);
    document.removeEventListener("keydown", handleDocumentKeyDown);
    window.clearInterval(clockInterval);
  });

  const isAtLiveEdge = () => {
    const transcript = transcriptRef;
    if (!transcript) {
      return true;
    }

    return (
      transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight <
      40
    );
  };

  const scrollToLatest = () => {
    requestAnimationFrame(() => {
      const transcript = transcriptRef;
      if (transcript) {
        transcript.scrollTop = transcript.scrollHeight;
      }
    });
  };

  const scrollTurnToTop = (id: string) => {
    requestAnimationFrame(() => {
      const element = transcriptRef?.querySelector(`[data-message-id="${id}"]`);
      element?.scrollIntoView({ block: "start" });
    });
  };

  const updateAssistantMessage = (
    id: string,
    updater: (message: ChatMessage) => ChatMessage
  ) => {
    setMessages((current) =>
      current.map((message) => (message.id === id ? updater(message) : message))
    );

    if (isFollowing()) {
      scrollToLatest();
    } else {
      setNewContentOffscreen(true);
    }
  };

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();

    const content = input().trim();
    if (!content || isStreaming()) {
      return;
    }

    const shouldGenerateThreadTitle = !activeThreadId() && messages().length === 0;
    const modelSelection = activeModelSelection();
    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content,
      status: "complete"
    };
    const assistantMessage: ChatMessage = {
      id: createId(),
      role: "assistant",
      content: "",
      status: "streaming"
    };
    const requestMessages = [...messages(), userMessage]
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map(({ role, content }) => ({ role, content }));

    setError("");
    setInput("");
    requestAnimationFrame(resizeInput);
    setIsStreaming(true);
    setIsFollowing(true);
    setNewContentOffscreen(false);
    setMessages((current) => [...current, userMessage, assistantMessage]);
    scrollTurnToTop(userMessage.id);

    abortController = new AbortController();

    try {
      let threadId = activeThreadId();
      if (!threadId) {
        threadId = await props.onCreateSession({
          title: titleFromContent(content)
        });
        setActiveThreadId(threadId);
      }

      await props.onAppendSessionMessage(threadId, {
        role: "user",
        content,
        metadata: {
          clientMessageId: userMessage.id
        }
      });

      let token = await props.ensureSession();
      let response = await postChat(
        props.apiBaseUrl,
        token,
        modelSelection,
        requestMessages,
        abortController.signal
      );

      if (response.status === 401) {
        token = await props.ensureSession(true);
        response = await postChat(
          props.apiBaseUrl,
          token,
          modelSelection,
          requestMessages,
          abortController.signal
        );
      }

      if (!response.ok) {
        throw new Error(await agentResponseErrorMessage(response));
      }

      if (!response.body) {
        throw new Error("The inference provider returned an empty response.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      while (true) {
        let result: ReadableStreamReadResult<Uint8Array>;
        try {
          result = await reader.read();
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            throw error;
          }

          throw new Error(
            "The inference provider connection stopped before the response completed."
          );
        }

        if (result.done) {
          break;
        }

        const chunk = decoder.decode(result.value, { stream: true });
        assistantContent += chunk;
        updateAssistantMessage(assistantMessage.id, (message) => ({
          ...message,
          content: message.content + chunk
        }));
      }

      updateAssistantMessage(assistantMessage.id, (message) => ({
        ...message,
        status: "complete"
      }));

      await props.onAppendSessionMessage(threadId, {
        role: "assistant",
        content: assistantContent,
        metadata: {
          clientMessageId: assistantMessage.id
        }
      });

      if (shouldGenerateThreadTitle && assistantContent.trim()) {
        void generateAndPersistThreadTitle({
          apiBaseUrl: props.apiBaseUrl,
          sessionToken: token,
          modelSelection,
          userContent: content,
          assistantContent,
          threadId,
          ensureSession: props.ensureSession,
          onSessionTitleChange: props.onSessionTitleChange
        });
      }
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) {
        const message =
          caught instanceof Error ? caught.message : "Unable to reach agent";
        setError(message);
        updateAssistantMessage(assistantMessage.id, (current) => ({
          ...current,
          status: "error",
          content: current.content || message
        }));
      }
    } finally {
      setIsStreaming(false);
      abortController = undefined;
      inputRef?.focus();
    }
  };

  const stop = () => {
    abortController?.abort();
    setIsStreaming(false);
  };

  const jumpToLatest = () => {
    setIsFollowing(true);
    setNewContentOffscreen(false);
    scrollToLatest();
  };

  const useSuggestion = (prompt: string) => {
    setInput(prompt);
    requestAnimationFrame(() => {
      resizeInput();
      inputRef?.focus();
    });
  };

  return (
    <div class="flex h-full min-h-0 flex-col">
      <MessageScroller
        viewportRef={(element) => {
          transcriptRef = element;
        }}
        onScroll={() => {
          if (isAtLiveEdge()) {
            setIsFollowing(true);
            setNewContentOffscreen(false);
          } else {
            stopFollowing();
          }
        }}
        onPointerDown={stopFollowing}
        onKeyDown={stopFollowing}
        showJumpToLatest={
          newContentOffscreen() || (!isFollowing() && isStreaming())
        }
        onJumpToLatest={jumpToLatest}
      >
        <Show
          when={hasMessages()}
          fallback={
            <EmptyChatState
              greeting={greeting()}
              onUseSuggestion={useSuggestion}
            />
          }
        >
          <For each={messages()}>
            {(message) => (
              <Message
                id={message.id}
                role={message.role}
                status={message.status}
              >
                <Show
                  when={message.role === "assistant"}
                  fallback={<MessageContent>{message.content}</MessageContent>}
                >
                  <AssistantMessageContent>{message.content}</AssistantMessageContent>
                </Show>
              </Message>
            )}
          </For>
        </Show>
      </MessageScroller>

      <form
        onSubmit={submit}
        class="mx-auto mt-4 flex w-full max-w-3xl shrink-0 flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-3"
      >
        <Show when={error()}>
          <p class="text-sm text-[var(--color-brand-soft)]">{error()}</p>
        </Show>
        <textarea
          ref={(element) => {
            inputRef = element;
            resizeInput();
          }}
          value={input()}
          onInput={(event) => {
            setInput(event.currentTarget.value);
            resizeInput();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          rows="1"
          placeholder={hasMessages() ? "Write a message..." : "How can I help you today?"}
          class="max-h-36 min-h-7 resize-none overflow-hidden bg-transparent text-sm leading-6 text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]"
        />
        <div class="flex items-center justify-between gap-3">
          <ModelPicker
            providers={props.providers}
            canConfigureModels={props.currentRole === "admin"}
            selectedModelSelection={activeModelSelection()}
            selectedModelLabel={activeModelLabel()}
            open={modelMenuOpen()}
            disabled={
              isStreaming() ||
              (props.providers.length === 0 && props.currentRole !== "admin")
            }
            onOpenChange={setModelMenuOpen}
            onConfigureModels={() => {
              setModelMenuOpen(false);
              props.onNavigate("/settings/inference");
            }}
            onSelect={(modelSelection) => {
              setSelectedModelSelection(modelSelection);
              setModelMenuOpen(false);
            }}
          />
          <div class="flex items-center gap-2">
            <Show when={isStreaming()}>
              <button
                type="button"
                onClick={stop}
                class="rounded-md border border-[var(--color-border-strong)] px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-panel-hover)]"
              >
                Stop
              </button>
            </Show>
            <button
              type="submit"
              disabled={!input().trim() || isStreaming() || !activeModelSelection()}
              class="rounded-md border border-[var(--color-brand)] bg-[var(--color-brand)] px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function titleFromContent(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Untitled session";
  }

  return normalized.length > 80
    ? `${normalized.slice(0, 77).trimEnd()}...`
    : normalized;
}

function isRenderableChatMessage(
  message: SessionMessage
): message is SessionMessage & { role: "user" | "assistant" } {
  return message.role === "user" || message.role === "assistant";
}

async function agentResponseErrorMessage(response: Response) {
  const fallback = `Inference request failed with ${response.status}`;
  const details = await response.text().catch(() => "");
  if (!details) {
    return fallback;
  }

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

async function generateAndPersistThreadTitle(request: {
  apiBaseUrl: string;
  sessionToken: string | undefined;
  modelSelection: string;
  userContent: string;
  assistantContent: string;
  threadId: string;
  ensureSession: (force?: boolean) => Promise<string | undefined>;
  onSessionTitleChange: (threadId: string, title: string) => Promise<void>;
}) {
  const abortController = new AbortController();
  const timeout = window.setTimeout(() => abortController.abort(), 15_000);

  try {
    const messages = threadTitlePromptMessages(
      request.userContent,
      request.assistantContent
    );
    let token = request.sessionToken ?? (await request.ensureSession());
    let response = await postChat(
      request.apiBaseUrl,
      token,
      request.modelSelection,
      messages,
      abortController.signal
    );

    if (response.status === 401) {
      token = await request.ensureSession(true);
      response = await postChat(
        request.apiBaseUrl,
        token,
        request.modelSelection,
        messages,
        abortController.signal
      );
    }

    if (!response.ok || !response.body) {
      return;
    }

    const generatedTitle = normalizeGeneratedThreadTitle(
      await readBoundedResponseText(response.body, 500)
    );
    if (!generatedTitle) {
      return;
    }

    await request.onSessionTitleChange(request.threadId, generatedTitle);
  } catch {
    return;
  } finally {
    window.clearTimeout(timeout);
  }
}

function threadTitlePromptMessages(
  userContent: string,
  assistantContent: string
): AgentChatMessage[] {
  return [
    {
      role: "user",
      content: [
        "Write a concise title for this chat thread.",
        "Use 3 to 6 words.",
        "Return only the title. Do not wrap it in quotes.",
        "",
        `User: ${userContent.slice(0, 2_000)}`,
        `Assistant: ${assistantContent.slice(0, 4_000)}`
      ].join("\n")
    }
  ];
}

async function readBoundedResponseText(
  body: ReadableStream<Uint8Array>,
  maxCharacters: number
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let content = "";

  while (content.length < maxCharacters) {
    const result = await reader.read();
    if (result.done) {
      break;
    }

    content += decoder.decode(result.value, { stream: true });
  }

  if (content.length >= maxCharacters) {
    await reader.cancel().catch(() => undefined);
  }

  return content.slice(0, maxCharacters);
}

function normalizeGeneratedThreadTitle(content: string) {
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

function ModelPicker(props: {
  providers: InferenceProviderStatus[];
  canConfigureModels: boolean;
  selectedModelSelection: string;
  selectedModelLabel: string;
  open: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onConfigureModels: () => void;
  onSelect: (modelSelection: string) => void;
}) {
  return (
    <Dropdown
      open={props.open}
      onOpenChange={props.onOpenChange}
      class="relative min-w-0"
      contentClass="absolute bottom-[calc(100%+0.5rem)] left-0 z-20 min-w-64 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-1 shadow-lg"
      trigger={(dropdown) => (
        <button
          type="button"
          aria-expanded={dropdown.isOpen()}
          disabled={props.disabled}
          onClick={dropdown.toggle}
          class="flex max-w-64 items-center gap-2 truncate rounded-md border border-transparent px-2 py-1 text-xs font-medium text-[var(--color-subtle)] transition hover:border-[var(--color-border)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span class="truncate">{props.selectedModelLabel || "No model"}</span>
          <span class="text-[var(--color-muted)]">⌄</span>
        </button>
      )}
    >
      <Show
        when={props.providers.length > 0}
        fallback={
          <Show when={props.canConfigureModels}>
            <button
              type="button"
              onClick={props.onConfigureModels}
              class="block w-full rounded px-2 py-1.5 text-left text-xs font-medium text-[var(--color-brand-soft)] transition hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)]"
            >
              Configure providers and models
            </button>
          </Show>
        }
      >
        <For each={props.providers}>
          {(provider) => (
            <div class="py-1">
              <div class="px-2 py-1 text-xs font-medium text-[var(--color-muted)]">
                {provider.label}
              </div>
              <For each={provider.models}>
                {(model) => {
                  const modelSelection = `${provider.id}:${model.id}`;
                  const selected = () =>
                    props.selectedModelSelection === modelSelection;

                  return (
                    <button
                      type="button"
                      aria-pressed={selected()}
                      onClick={() => props.onSelect(modelSelection)}
                      class={`block w-full rounded px-2 py-1.5 text-left text-xs font-medium transition ${
                        selected()
                          ? "bg-[var(--color-brand)] text-white"
                          : "text-[var(--color-text)] hover:bg-[var(--color-panel-hover)]"
                      }`}
                    >
                      {model.label}
                    </button>
                  );
                }}
              </For>
            </div>
          )}
        </For>
      </Show>
    </Dropdown>
  );
}

function getModelLabel(
  providers: InferenceProviderStatus[],
  modelSelection: string
) {
  const separatorIndex = modelSelection.indexOf(":");
  if (separatorIndex === -1) {
    return "";
  }

  const providerId = modelSelection.slice(0, separatorIndex);
  const modelId = modelSelection.slice(separatorIndex + 1);
  const provider = providers.find((candidate) => candidate.id === providerId);
  const model = provider?.models.find((candidate) => candidate.id === modelId);

  return model ? model.label : "";
}

function postChat(
  apiBaseUrl: string,
  sessionToken: string | undefined,
  modelSelection: string,
  messages: AgentChatMessage[],
  signal: AbortSignal
) {
  return streamAgentChat(apiBaseUrl, "lush", sessionToken, {
    messages,
    modelSelection
  }, signal);
}

function EmptyChatState(props: {
  greeting: string;
  onUseSuggestion: (prompt: string) => void;
}) {
  return (
    <div class="flex min-h-[58vh] flex-col justify-center gap-10 py-10">
      <div class="flex flex-wrap items-center justify-center gap-4 text-center">
        <img src={logoUrl} alt="Lush" class="h-10 w-10 shrink-0" />
        <h1 class="text-4xl font-medium leading-tight text-[var(--color-text)]">
          {props.greeting}
        </h1>
      </div>

      <div class="grid gap-8 md:grid-cols-2">
        <section>
          <h2 class="text-sm font-medium text-[var(--color-muted)]">
            Active tasks
          </h2>
          <p class="mt-3 max-w-sm text-sm leading-6 text-[var(--color-muted)]">
            Kick off a few agent tasks at once. They can run in parallel and
            updates will appear here.
          </p>
          <button
            type="button"
            onClick={() => props.onUseSuggestion("Help me plan a work task")}
            class="mt-3 text-sm font-medium text-[var(--color-subtle)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:text-[var(--color-text)]"
          >
            Try it with Work
          </button>
        </section>

        <section>
          <h2 class="text-sm font-medium text-[var(--color-muted)]">
            Ideas for you
          </h2>
          <div class="mt-3 grid gap-2">
            <For each={suggestionPrompts}>
              {(suggestion) => (
                <button
                  type="button"
                  onClick={() => props.onUseSuggestion(suggestion.prompt)}
                  class="group flex min-h-10 items-center justify-between gap-4 rounded-md px-3 py-2 text-left text-sm text-[var(--color-text)] transition hover:bg-[var(--color-panel-hover)] focus:bg-[var(--color-panel-hover)] focus:outline-none"
                >
                  <span>{suggestion.prompt}</span>
                  <span class="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100 group-focus:opacity-100">
                    <For each={suggestion.integrations}>
                      {(integration) => (
                        <span class="rounded-md bg-[var(--color-bg)] px-2 py-1 text-xs font-medium text-[var(--color-subtle)]">
                          {integration}
                        </span>
                      )}
                    </For>
                    <span class="pl-1 text-sm text-[var(--color-muted)]">
                      {suggestion.mode}
                    </span>
                  </span>
                </button>
              )}
            </For>
          </div>
        </section>
      </div>
    </div>
  );
}
