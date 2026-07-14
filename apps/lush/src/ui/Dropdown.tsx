import { useEffect, useRef, type ReactNode } from "react";

export function Dropdown(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
  contentClass: string;
  trigger: (controls: {
    isOpen: () => boolean;
    toggle: () => void;
    close: () => void;
  }) => ReactNode;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  const close = () => props.onOpenChange(false);
  const toggle = () => props.onOpenChange(!props.open);

  useEffect(() => {
    if (!props.open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
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
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [props.open, props.onOpenChange]);

  return (
    <div ref={rootRef} className={props.className ?? "relative"}>
      {props.trigger({
        isOpen: () => props.open,
        toggle,
        close
      })}
      {props.open ? <div className={props.contentClass}>{props.children}</div> : null}
    </div>
  );
}
