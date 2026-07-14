import type { ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import {
  MessageScroller as ShadcnMessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport
} from "../components/ui/message-scroller";

export function MessageScroller(props: {
  children: ReactNode;
  resetKey: string;
  busy?: boolean;
}) {
  return (
    <MessageScrollerProvider
      key={props.resetKey}
      autoScroll
      defaultScrollPosition="last-anchor"
      scrollEdgeThreshold={40}
      scrollPreviousItemPeek={64}
      scrollMargin={32}
    >
      <ShadcnMessageScroller className="relative min-h-0 flex-1">
        <MessageScrollerViewport className="h-full overflow-y-auto pr-3">
          <MessageScrollerContent
            aria-busy={props.busy}
            className="mx-auto flex max-w-3xl flex-col gap-8 pb-8"
          >
            {props.children}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton
          direction="end"
          className="bottom-4 border-[var(--color-border-strong)] bg-[var(--color-panel)] text-[var(--color-text)] shadow-lg shadow-[var(--shadow-menu)] hover:bg-[var(--color-panel-hover)]"
          render={<button type="button" />}
        >
          <ArrowDown aria-hidden="true" />
          <span className="sr-only">Jump to latest</span>
        </MessageScrollerButton>
      </ShadcnMessageScroller>
    </MessageScrollerProvider>
  );
}

export { MessageScrollerItem };
