import { createEffect, onCleanup, Show } from "solid-js";
import type { JSX } from "solid-js";

export function Dropdown(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  class?: string;
  contentClass: string;
  trigger: (controls: {
    isOpen: () => boolean;
    toggle: () => void;
    close: () => void;
  }) => JSX.Element;
  children: JSX.Element;
}) {
  let rootRef: HTMLDivElement | undefined;

  const close = () => props.onOpenChange(false);
  const toggle = () => props.onOpenChange(!props.open);

  createEffect(() => {
    if (!props.open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        rootRef &&
        event.target instanceof Node &&
        !rootRef.contains(event.target)
      ) {
        close();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    });
  });

  return (
    <div ref={rootRef} class={props.class ?? "relative"}>
      {props.trigger({
        isOpen: () => props.open,
        toggle,
        close
      })}
      <Show when={props.open}>
        <div class={props.contentClass}>{props.children}</div>
      </Show>
    </div>
  );
}
