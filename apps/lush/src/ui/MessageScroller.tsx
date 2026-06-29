import type { JSX } from "solid-js";
import { Marker } from "./Marker";
import { ScrollFade } from "./ScrollFade";

export function MessageScroller(props: {
  children: JSX.Element;
  viewportRef?: (element: HTMLDivElement) => void;
  onScroll?: JSX.EventHandlerUnion<HTMLDivElement, Event>;
  onPointerDown?: JSX.EventHandlerUnion<HTMLDivElement, PointerEvent>;
  onKeyDown?: JSX.EventHandlerUnion<HTMLDivElement, KeyboardEvent>;
  showJumpToLatest?: boolean;
  onJumpToLatest?: () => void;
}) {
  return (
    <div class="relative min-h-0 flex-1">
      <ScrollFade
        class="h-full"
        viewportRef={props.viewportRef}
        onScroll={props.onScroll}
        onPointerDown={props.onPointerDown}
        onKeyDown={props.onKeyDown}
        viewportClass="h-full overflow-y-auto pr-3"
        contentClass="mx-auto flex max-w-3xl flex-col gap-5 pb-32"
        ariaLive="polite"
        top={false}
        bottom
      >
        {props.children}
      </ScrollFade>

      {props.showJumpToLatest ? (
        <button
          type="button"
          onClick={props.onJumpToLatest}
          class="absolute bottom-28 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--color-brand)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-text)] shadow-xl shadow-[var(--shadow-menu)]"
        >
          <Marker tone="brand">New</Marker>
          <span>Jump to latest</span>
        </button>
      ) : null}
    </div>
  );
}
