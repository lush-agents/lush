import { Show } from "solid-js";
import type { JSX } from "solid-js";
import { Bubble, BubbleContent } from "./Bubble";
import { MarkdownStream } from "./MarkdownStream";
import { Marker } from "./Marker";
import { Shimmer } from "./Shimmer";

export function Message(props: {
  id: string;
  role: "user" | "assistant";
  status?: "streaming" | "complete" | "error";
  children: JSX.Element;
}) {
  return (
    <article
      data-message-id={props.id}
      class="scroll-mt-8"
    >
      <Bubble
        align={props.role === "user" ? "end" : "start"}
        variant={props.role === "user" ? "tinted" : "default"}
      >
        <div class="mb-2 flex items-center justify-between gap-3">
          <h2 class="text-sm font-medium text-[var(--color-text)]">
            {props.role === "user" ? "You" : "Lush"}
          </h2>
          <Show when={props.status === "streaming"}>
            <Marker>Streaming</Marker>
          </Show>
        </div>
        <BubbleContent>
          {props.children}
        </BubbleContent>
      </Bubble>
    </article>
  );
}

export function MessageContent(props: { children?: string }) {
  return (
    <Show when={props.children} fallback={<Shimmer>Thinking...</Shimmer>}>
      {props.children}
    </Show>
  );
}

export function AssistantMessageContent(props: { children?: string }) {
  return <MarkdownStream source={props.children} />;
}
