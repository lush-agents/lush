import { useEffect, useState } from "react";
import {
  CheckIcon,
  CopyIcon,
  FileTextIcon,
  ThumbsDownIcon,
  ThumbsUpIcon
} from "lucide-react";
import {
  Message as ShadcnMessage,
  MessageContent as ShadcnMessageContent,
  MessageFooter,
  MessageHeader
} from "../components/ui/message";
import { Bubble, BubbleContent } from "../components/ui/bubble";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle
} from "../components/ui/attachment";
import {
  Marker,
  MarkerContent,
  MarkerIcon
} from "../components/ui/marker";
import { Spinner } from "../components/ui/spinner";
import {
  MessageAction,
  MessageActions,
  MessageResponse
} from "../components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger
} from "../components/ai-elements/reasoning";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger
} from "../components/ai-elements/sources";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput
} from "../components/ai-elements/tool";
import {
  Artifact,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle
} from "../components/ai-elements/artifact";
import { chatMessageText } from "../lib/agent-message";
import type { ChatMessage, ChatMessagePart } from "../lib/types";

export function Message({
  message,
  initialFeedback,
  onFeedback
}: {
  message: ChatMessage;
  initialFeedback?: "up" | "down";
  onFeedback?: (messageId: string, sentiment: "up" | "down") => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | undefined>(
    initialFeedback
  );
  const sources = message.parts.filter(
    (part): part is Extract<ChatMessagePart, { type: "source" }> =>
      part.type === "source"
  );
  const attachments = message.parts.filter(
    (part): part is Extract<ChatMessagePart, { type: "attachment" }> =>
      part.type === "attachment"
  );

  const copy = async () => {
    await navigator.clipboard.writeText(chatMessageText(message));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  useEffect(() => setFeedback(initialFeedback), [initialFeedback]);

  const submitFeedback = async (sentiment: "up" | "down") => {
    setFeedback(sentiment);
    await onFeedback?.(message.id, sentiment);
  };

  return (
    <article
      data-message-id={message.id}
      className="group/chat-message scroll-mt-8"
    >
      <ShadcnMessage align={message.role === "user" ? "end" : "start"}>
        <ShadcnMessageContent>
          {message.status === "streaming" ? (
            <MessageHeader className="px-0">
              <Marker role="status" className="w-auto text-xs">
                <MarkerIcon>
                  <Spinner />
                </MarkerIcon>
                <MarkerContent>Working</MarkerContent>
              </Marker>
            </MessageHeader>
          ) : null}

          <Bubble
            align={message.role === "user" ? "end" : "start"}
            variant={message.role === "user" ? "muted" : "ghost"}
            className={
              message.role === "assistant" ? "max-w-full" : "max-w-[76%]"
            }
          >
            <BubbleContent
              className={
                message.role === "user"
                  ? "rounded-xl px-4 py-3 text-[0.9375rem] leading-6"
                  : "text-[0.975rem] leading-7"
              }
            >
              {sources.length > 0 ? (
                <Sources>
                  <SourcesTrigger count={sources.length} />
                  <SourcesContent>
                    {sources.map((source) => (
                      <Source
                        key={source.sourceId}
                        href={source.url}
                        title={source.title}
                      />
                    ))}
                  </SourcesContent>
                </Sources>
              ) : null}

              {attachments.length > 0 ? (
                <AttachmentGroup className="mb-3">
                  {attachments.map((attachment) => (
                    <Attachment key={attachment.id} size="sm">
                      <AttachmentMedia>
                        <FileTextIcon />
                      </AttachmentMedia>
                      <AttachmentContent>
                        <AttachmentTitle>{attachment.filename}</AttachmentTitle>
                        <AttachmentDescription>
                          {attachment.mediaType} · {formatBytes(attachment.size)}
                        </AttachmentDescription>
                      </AttachmentContent>
                    </Attachment>
                  ))}
                </AttachmentGroup>
              ) : null}

              {message.parts.map((part, index) => (
                <MessagePart
                  key={partKey(part, index)}
                  part={part}
                  role={message.role}
                  streaming={message.status === "streaming"}
                />
              ))}

              {message.status === "streaming" && message.parts.length === 0 ? (
                <Marker role="status">
                  <MarkerIcon>
                    <Spinner />
                  </MarkerIcon>
                  <MarkerContent>Thinking...</MarkerContent>
                </Marker>
              ) : null}
            </BubbleContent>
          </Bubble>

          {message.status !== "streaming" ? (
            <MessageFooter
              className={
                message.role === "user"
                  ? "opacity-0 transition-opacity group-focus-within/chat-message:opacity-100 group-hover/chat-message:opacity-100"
                  : undefined
              }
            >
              <MessageActions className="gap-0.5">
                <MessageAction
                  tooltip={message.role === "user" ? "Copy message" : "Copy response"}
                  onClick={() => void copy()}
                >
                  {copied ? <CheckIcon /> : <CopyIcon />}
                </MessageAction>
                {message.role === "assistant" ? (
                  <>
                    <MessageAction
                      tooltip="Helpful"
                      aria-pressed={feedback === "up"}
                      onClick={() => void submitFeedback("up")}
                    >
                      <ThumbsUpIcon />
                    </MessageAction>
                    <MessageAction
                      tooltip="Not helpful"
                      aria-pressed={feedback === "down"}
                      onClick={() => void submitFeedback("down")}
                    >
                      <ThumbsDownIcon />
                    </MessageAction>
                  </>
                ) : null}
              </MessageActions>
            </MessageFooter>
          ) : null}
        </ShadcnMessageContent>
      </ShadcnMessage>
    </article>
  );
}

function MessagePart(props: {
  part: ChatMessagePart;
  role: ChatMessage["role"];
  streaming: boolean;
}) {
  const { part } = props;
  switch (part.type) {
    case "text":
      return props.role === "assistant" ? (
        <MessageResponse
          className="font-serif text-base leading-[25px] [&_code]:font-mono [&_pre]:font-mono"
          isAnimating={props.streaming}
        >
          {part.text}
        </MessageResponse>
      ) : (
        <p className="whitespace-pre-wrap text-[0.9375rem] leading-6">
          {part.text}
        </p>
      );
    case "reasoning":
      return (
        <Reasoning isStreaming={props.streaming} duration={part.durationMs ? part.durationMs / 1_000 : undefined}>
          <ReasoningTrigger />
          <ReasoningContent>{part.text}</ReasoningContent>
        </Reasoning>
      );
    case "tool":
      return (
        <Tool>
          <ToolHeader
            type="dynamic-tool"
            toolName={part.toolName}
            title={part.toolName}
            state={part.state}
          />
          <ToolContent>
            {part.input !== undefined ? <ToolInput input={part.input} /> : null}
            <ToolOutput output={part.output} errorText={part.errorText} />
          </ToolContent>
        </Tool>
      );
    case "artifact":
      return (
        <Artifact>
          <ArtifactHeader>
            <div>
              <ArtifactTitle>{part.title}</ArtifactTitle>
              {part.description ? (
                <ArtifactDescription>{part.description}</ArtifactDescription>
              ) : null}
            </div>
          </ArtifactHeader>
          {part.content ? (
            <ArtifactContent>
              <pre className="overflow-x-auto whitespace-pre-wrap text-xs">{part.content}</pre>
            </ArtifactContent>
          ) : null}
        </Artifact>
      );
    case "attachment":
    case "source":
      return null;
  }
}

function partKey(part: ChatMessagePart, index: number) {
  if (part.type === "tool") return `tool-${part.toolCallId}`;
  if (part.type === "source") return `source-${part.sourceId}`;
  if (part.type === "artifact") return `artifact-${part.artifactId}`;
  if (part.type === "attachment") return `attachment-${part.id}`;
  return `${part.type}-${index}`;
}

function formatBytes(size?: number) {
  if (!size) return "text context";
  return size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;
}
