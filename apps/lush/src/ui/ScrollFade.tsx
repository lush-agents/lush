import type { KeyboardEventHandler, PointerEventHandler, ReactNode, UIEventHandler } from "react";

export function ScrollFade(props: {
  children: ReactNode;
  className?: string;
  viewportClass?: string;
  contentClass?: string;
  top?: boolean;
  bottom?: boolean;
  ariaLive?: "off" | "polite" | "assertive";
  viewportRef?: (element: HTMLDivElement) => void;
  onScroll?: UIEventHandler<HTMLDivElement>;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
}) {
  return (
    <div className={`relative min-h-0 ${props.className ?? ""}`}>
      <div
        ref={(element) => {
          if (element) props.viewportRef?.(element);
        }}
        onScroll={props.onScroll}
        onPointerDown={props.onPointerDown}
        onKeyDown={props.onKeyDown}
        className={`min-h-0 ${props.viewportClass ?? "h-full overflow-y-auto"}`}
        aria-live={props.ariaLive}
      >
        <div className={props.contentClass}>{props.children}</div>
      </div>
      {props.top ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-[var(--color-bg)] to-transparent" />
      ) : null}
      {props.bottom ?? true ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-[var(--color-bg)] to-transparent" />
      ) : null}
    </div>
  );
}
