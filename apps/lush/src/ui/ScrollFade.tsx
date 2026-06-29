import type { JSX } from "solid-js";

export function ScrollFade(props: {
  children: JSX.Element;
  class?: string;
  viewportClass?: string;
  contentClass?: string;
  top?: boolean;
  bottom?: boolean;
  ariaLive?: "off" | "polite" | "assertive";
  viewportRef?: (element: HTMLDivElement) => void;
  onScroll?: JSX.EventHandlerUnion<HTMLDivElement, Event>;
  onPointerDown?: JSX.EventHandlerUnion<HTMLDivElement, PointerEvent>;
  onKeyDown?: JSX.EventHandlerUnion<HTMLDivElement, KeyboardEvent>;
}) {
  return (
    <div class={`relative min-h-0 ${props.class ?? ""}`}>
      <div
        ref={props.viewportRef}
        onScroll={props.onScroll}
        onPointerDown={props.onPointerDown}
        onKeyDown={props.onKeyDown}
        class={`min-h-0 ${props.viewportClass ?? "h-full overflow-y-auto"}`}
        aria-live={props.ariaLive}
      >
        <div class={props.contentClass}>{props.children}</div>
      </div>
      {props.top ? (
        <div class="pointer-events-none absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-[var(--color-bg)] to-transparent" />
      ) : null}
      {props.bottom ?? true ? (
        <div class="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-[var(--color-bg)] to-transparent" />
      ) : null}
    </div>
  );
}
