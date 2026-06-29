import type { JSX } from "solid-js";

type BubbleVariant =
  | "default"
  | "secondary"
  | "muted"
  | "tinted"
  | "outline"
  | "ghost"
  | "destructive";

type BubbleAlign = "start" | "end";
type BubbleSide = "top" | "bottom";

type ClassProps = {
  class?: string;
  className?: string;
};

function cx(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

function className(props: ClassProps) {
  return props.class ?? props.className;
}

export function Bubble(props: {
  children: JSX.Element;
  variant?: BubbleVariant;
  align?: BubbleAlign;
} & ClassProps) {
  const variant = () => props.variant ?? "default";
  const align = () => props.align ?? "start";
  const variantClass = () => {
    switch (variant()) {
      case "secondary":
        return "border-[var(--color-border)] bg-[var(--color-panel)]";
      case "muted":
        return "border-[var(--color-border)] bg-transparent text-[var(--color-muted)]";
      case "tinted":
        return "border-[var(--color-brand)] bg-[var(--color-panel-hover)]";
      case "outline":
        return "border-[var(--color-border-strong)] bg-transparent";
      case "ghost":
        return "border-transparent bg-transparent";
      case "destructive":
        return "border-red-500/60 bg-red-500/10";
      case "default":
      default:
        return "border-[var(--color-border)] bg-[var(--color-card)]";
    }
  };

  return (
    <div
      class={cx(
        "relative flex w-full",
        align() === "end" ? "justify-end" : "justify-start",
        className(props)
      )}
    >
      <div class={cx("max-w-3xl rounded-lg border p-4", variantClass())}>
        {props.children}
      </div>
    </div>
  );
}

export function BubbleContent(props: {
  children: JSX.Element;
  // Kept for API parity with the shadcn primitive; Solid callers can pass the
  // Keep this narrow; polymorphic slot behavior is unnecessary here.
  asChild?: boolean;
} & ClassProps) {
  return (
    <div
      class={cx(
        "text-sm leading-6 text-[var(--color-subtle)]",
        className(props)
      )}
    >
      {props.children}
    </div>
  );
}

export function BubbleReactions(props: {
  children: JSX.Element;
  side?: BubbleSide;
  align?: BubbleAlign;
} & ClassProps) {
  const side = () => props.side ?? "bottom";
  const align = () => props.align ?? "end";

  return (
    <div
      class={cx(
        "absolute z-10 flex -space-x-1",
        side() === "top" ? "-top-3" : "-bottom-3",
        align() === "end" ? "right-3" : "left-3",
        className(props)
      )}
    >
      {props.children}
    </div>
  );
}

export function BubbleGroup(props: {
  children: JSX.Element;
} & ClassProps) {
  return (
    <div class={cx("flex flex-col gap-2", className(props))}>
      {props.children}
    </div>
  );
}
