import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  type InferenceProviderStatus,
  type Session,
  type UserRole,
} from "@lush/api-client";
import { EmptyChatState } from "../../components/chat/EmptyChatState";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments
} from "../../components/ai-elements/attachments";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  type PromptInputMessage,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments
} from "../../components/ai-elements/prompt-input";
import { Settings2Icon } from "lucide-react";
import { createId, getFirstName } from "../../lib/app-data";
import {
  appendAgentStreamEvent,
  chatMessageFromSession,
  chatMessageMetadata,
  chatMessageRequestText,
  chatMessageText,
  promptAttachments,
  readAgentEventStream
} from "../../lib/agent-message";
import {
  agentResponseErrorMessage,
  generateAndPersistSessionTitle,
  getModelLabel,
  postSessionChat,
  titleFromContent
} from "../../lib/chat-stream";
import type { ChatMessage, ChatMessagePart } from "../../lib/types";
import { Message } from "../../ui/Message";
import { MessageScroller, MessageScrollerItem } from "../../ui/MessageScroller";
import { agentChatDeltaMessages } from "../../lib/agent-chat-request";

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
  session?: Session;
  sessionKey: number;
  ensureSession: (force?: boolean) => Promise<string | undefined>;
  onCreateSession: (request: { title: string }) => Promise<string>;
  onAppendSessionMessage: (
    sessionId: string,
    message: {
      role: "user" | "assistant";
      content: string;
      metadata?: unknown;
    }
  ) => Promise<void>;
  onSessionTitleChange: (sessionId: string, title: string) => Promise<void>;
  onMessageFeedback: (
    sessionId: string,
    messageId: string,
    sentiment: "up" | "down"
  ) => Promise<void>;
}) {
  const navigate = useNavigate();
  const abortControllerRef = useRef<AbortController | undefined>(undefined);
  const syncedSessionKeyRef = useRef<number | undefined>(undefined);

  const [now, setNow] = useState(new Date());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");
  const [selectedModelSelection, setSelectedModelSelection] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string>();
  const greeting = `${getGreeting(now)}, ${getFirstName(props.displayName)}`;
  const hasMessages = messages.length > 0;
  const enabledModelSelections =
    props.providers.flatMap((provider) =>
      provider.models.map((model) => `${provider.id}:${model.id}`)
    );
  const activeModelSelection = (() => {
    const selected = selectedModelSelection;
    if (selected && enabledModelSelections.includes(selected)) {
      return selected;
    }

    if (
      props.defaultModelSelection &&
      enabledModelSelections.includes(props.defaultModelSelection)
    ) {
      return props.defaultModelSelection;
    }

    return enabledModelSelections[0] ?? "";
  })();
  const activeModelLabel =
    getModelLabel(props.providers, activeModelSelection)
  ;

  useEffect(() => {
    if (!selectedModelSelection && props.defaultModelSelection) {
      setSelectedModelSelection(props.defaultModelSelection);
    }
  }, [selectedModelSelection, props.defaultModelSelection]);

  useEffect(() => {
    const session = props.session;
    const sessionKey = props.sessionKey;
    if (isStreaming || sessionKey === syncedSessionKeyRef.current) {
      return;
    }

    syncedSessionKeyRef.current = sessionKey;
    setActiveSessionId(session?.id);
    setMessages(
      (session?.messages ?? [])
        .map(chatMessageFromSession)
        .filter((message): message is ChatMessage => Boolean(message))
    );
    setError("");
  }, [props.session, props.sessionKey, isStreaming]);

  useEffect(() => {
    const clockInterval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => {
      window.clearInterval(clockInterval);
    };
  }, []);

  const updateAssistantMessage = (
    id: string,
    updater: (message: ChatMessage) => ChatMessage
  ) => {
    setMessages((current) =>
      current.map((message) => (message.id === id ? updater(message) : message))
    );

  };

  const submit = async (prompt: PromptInputMessage) => {
    const content = prompt.text.trim();
    if ((!content && prompt.files.length === 0) || isStreaming) {
      return;
    }

    const attachments = await promptAttachments(prompt.files);

    const shouldGenerateSessionTitle = !activeSessionId && messages.length === 0;
    const modelSelection = activeModelSelection;
    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      parts: [
        ...(content ? [{ type: "text" as const, text: content }] : []),
        ...attachments
      ],
      status: "complete"
    };
    const assistantMessage: ChatMessage = {
      id: createId(),
      role: "assistant",
      parts: [],
      status: "streaming"
    };
    const requestMessages = agentChatDeltaMessages(userMessage);
    setError("");
    setInput("");
    setIsStreaming(true);
    setMessages((current) => [...current, userMessage, assistantMessage]);

    abortControllerRef.current = new AbortController();
    let sessionId = activeSessionId;
    let assistantParts: ChatMessagePart[] = [];

    try {
      if (!sessionId) {
        sessionId = await props.onCreateSession({
          title: titleFromContent(content || attachments[0]?.filename || "")
        });
        setActiveSessionId(sessionId);
      }

      await props.onAppendSessionMessage(sessionId, {
        role: "user",
        content: chatMessageRequestText(userMessage),
        metadata: chatMessageMetadata(userMessage.parts)
      });

      let token = await props.ensureSession();
      let response = await postSessionChat(
        props.apiBaseUrl,
        token,
        modelSelection,
        sessionId,
        requestMessages,
        abortControllerRef.current.signal
      );

      if (response.status === 401) {
        token = await props.ensureSession(true);
        response = await postSessionChat(
          props.apiBaseUrl,
          token,
          modelSelection,
          sessionId,
          requestMessages,
          abortControllerRef.current.signal
        );
      }

      if (!response.ok) {
        throw new Error(await agentResponseErrorMessage(response));
      }

      if (!response.body) {
        throw new Error("The inference provider returned an empty response.");
      }

      await readAgentEventStream(response, (event) => {
        if (event.type === "response-error") {
          throw new Error(event.message);
        }
        assistantParts = appendAgentStreamEvent(assistantParts, event);
        updateAssistantMessage(assistantMessage.id, (message) => ({
          ...message,
          parts: assistantParts
        }));
      });
      const assistantContent = chatMessageText({ parts: assistantParts });

      updateAssistantMessage(assistantMessage.id, (message) => ({
        ...message,
        status: "complete"
      }));

      await props.onAppendSessionMessage(sessionId, {
        role: "assistant",
        content: assistantContent,
        metadata: chatMessageMetadata(assistantParts)
      });

      if (shouldGenerateSessionTitle && assistantContent.trim()) {
        void generateAndPersistSessionTitle({
          apiBaseUrl: props.apiBaseUrl,
          sessionToken: token,
          modelSelection,
          userContent:
            content || `Attached: ${attachments.map((item) => item.filename).join(", ")}`,
          assistantContent,
          sessionId,
          ensureSession: props.ensureSession,
          onSessionTitleChange: props.onSessionTitleChange
        });
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        updateAssistantMessage(assistantMessage.id, (current) => ({
          ...current,
          parts: assistantParts,
          status: "complete"
        }));
        if (sessionId && chatMessageText({ parts: assistantParts }).trim()) {
          await props.onAppendSessionMessage(sessionId, {
            role: "assistant",
            content: chatMessageText({ parts: assistantParts }),
            metadata: chatMessageMetadata(assistantParts)
          }).catch(() => undefined);
        }
      } else {
        const message =
          caught instanceof Error ? caught.message : "Unable to reach agent";
        setError(message);
        updateAssistantMessage(assistantMessage.id, (current) => ({
          ...current,
          status: "error",
          parts: chatMessageText(current)
            ? current.parts
            : [{ type: "text", text: message }]
        }));
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = undefined;
    }
  };

  const stop = () => {
    abortControllerRef.current?.abort();
  };

  const useSuggestion = (prompt: string) => {
    setInput(prompt);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MessageScroller
        resetKey={activeSessionId ?? props.session?.id ?? "new"}
        busy={isStreaming}
      >
        {hasMessages ? (
          messages.map((message) => (
              <MessageScrollerItem
                key={message.id}
                messageId={message.id}
                scrollAnchor={message.role === "user"}
              >
                <Message
                  message={message}
                  initialFeedback={feedbackForMessage(props.session, message.id)}
                  onFeedback={
                    activeSessionId
                      ? (messageId, sentiment) =>
                          props.onMessageFeedback(
                            activeSessionId,
                            messageId,
                            sentiment
                          )
                      : undefined
                  }
                />
              </MessageScrollerItem>
          ))
        ) : (
          <EmptyChatState
            greeting={greeting}
            onUseSuggestion={useSuggestion}
          />
        )}
      </MessageScroller>

      <div className="mx-auto mt-4 w-full max-w-3xl shrink-0">
        <PromptInput
          onSubmit={submit}
          accept="text/*,application/json,application/xml,application/yaml,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.rs,.go,.java,.yaml,.yml,.toml,.sql"
          multiple
          maxFiles={4}
          maxFileSize={32 * 1024}
          onError={(promptError) => setError(promptError.message)}
          className="w-full"
        >
          <PendingAttachments />
          <PromptInputBody>
            <PromptInputTextarea
              value={input}
              onChange={(event) => setInput(event.currentTarget.value)}
              placeholder={
                hasMessages ? "Write a message..." : "How can I help you today?"
              }
              className="min-h-12 px-4 pt-3 text-base md:text-base"
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools className="w-full">
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger tooltip="Add context" />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments label="Add text files" />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>

              <div className="ml-auto min-w-0">
                {props.providers.length > 0 ? (
                  <PromptInputSelect
                    value={activeModelSelection}
                    onValueChange={(value) =>
                      setSelectedModelSelection(value ?? "")
                    }
                    disabled={isStreaming}
                  >
                    <PromptInputSelectTrigger className="max-w-52">
                      <PromptInputSelectValue placeholder="Select model">
                        {activeModelLabel}
                      </PromptInputSelectValue>
                    </PromptInputSelectTrigger>
                    <PromptInputSelectContent>
                      {props.providers.flatMap((provider) =>
                        provider.models.map((model) => {
                          const selection = `${provider.id}:${model.id}`;
                          return (
                            <PromptInputSelectItem
                              key={selection}
                              value={selection}
                            >
                              {provider.label} / {model.label}
                            </PromptInputSelectItem>
                          );
                        })
                      )}
                    </PromptInputSelectContent>
                  </PromptInputSelect>
                ) : props.currentRole === "admin" ? (
                  <PromptInputButton
                    tooltip="Configure inference"
                    onClick={() => navigate("/settings/inference")}
                  >
                    <Settings2Icon />
                    Configure model
                  </PromptInputButton>
                ) : null}
              </div>
            </PromptInputTools>
            <ChatSubmit
              input={input}
              error={error}
              isStreaming={isStreaming}
              modelSelection={activeModelSelection}
              onStop={stop}
            />
          </PromptInputFooter>
          {error ? (
            <p className="px-3 pb-2 text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </PromptInput>
        <p className="mt-2 text-center text-[0.6875rem] text-[var(--color-muted)]">
          Lush can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}

function feedbackForMessage(
  session: Session | undefined,
  messageId: string
): "up" | "down" | undefined {
  for (const snapshot of [...(session?.stateSnapshots ?? [])].reverse()) {
    if (snapshot.kind !== "message_feedback" || !snapshot.state || typeof snapshot.state !== "object") {
      continue;
    }
    const state = snapshot.state as { messageId?: unknown; sentiment?: unknown };
    if (
      state.messageId === messageId &&
      (state.sentiment === "up" || state.sentiment === "down")
    ) {
      return state.sentiment;
    }
  }
  return undefined;
}

function PendingAttachments() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;

  return (
    <PromptInputHeader>
      <Attachments variant="inline">
        {attachments.files.map((file) => (
          <Attachment
            key={file.id}
            data={file}
            onRemove={() => attachments.remove(file.id)}
          >
            <AttachmentPreview />
            <AttachmentInfo />
            <AttachmentRemove />
          </Attachment>
        ))}
      </Attachments>
    </PromptInputHeader>
  );
}

function ChatSubmit(props: {
  input: string;
  error: string;
  isStreaming: boolean;
  modelSelection: string;
  onStop: () => void;
}) {
  const attachments = usePromptInputAttachments();
  return (
    <PromptInputSubmit
      status={props.isStreaming ? "streaming" : props.error ? "error" : "ready"}
      onStop={props.onStop}
      disabled={
        !props.isStreaming &&
        (!props.modelSelection ||
          (!props.input.trim() && attachments.files.length === 0))
      }
    />
  );
}
