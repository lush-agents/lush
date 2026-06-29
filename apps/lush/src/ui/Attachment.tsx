import type { JSX } from "solid-js";

type AttachmentStatus = "idle" | "uploading" | "complete" | "error";

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

export function Attachment(props: {
  children: JSX.Element;
  status?: AttachmentStatus;
} & ClassProps) {
  const status = () => props.status ?? "idle";
  const statusClass = () => {
    switch (status()) {
      case "uploading":
        return "border-[var(--color-brand)]";
      case "complete":
        return "border-[var(--color-border)]";
      case "error":
        return "border-red-500/60";
      case "idle":
      default:
        return "border-[var(--color-border)]";
    }
  };

  return (
    <div
      class={cx(
        "flex min-w-0 items-center gap-3 rounded-lg border bg-[var(--color-panel)] p-3",
        statusClass(),
        className(props)
      )}
      data-status={status()}
    >
      {props.children}
    </div>
  );
}

export function AttachmentIcon(props: {
  children?: JSX.Element;
} & ClassProps) {
  return (
    <div
      class={cx(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--color-panel-hover)] text-sm font-medium text-[var(--color-muted)]",
        className(props)
      )}
    >
      {props.children ?? "File"}
    </div>
  );
}

export function AttachmentContent(props: {
  children: JSX.Element;
} & ClassProps) {
  return (
    <div class={cx("min-w-0 flex-1", className(props))}>{props.children}</div>
  );
}

export function AttachmentTitle(props: {
  children: JSX.Element;
} & ClassProps) {
  return (
    <div
      class={cx(
        "truncate text-sm font-medium text-[var(--color-text)]",
        className(props)
      )}
    >
      {props.children}
    </div>
  );
}

export function AttachmentDescription(props: {
  children: JSX.Element;
} & ClassProps) {
  return (
    <div class={cx("truncate text-xs text-[var(--color-muted)]", className(props))}>
      {props.children}
    </div>
  );
}

export function AttachmentActions(props: {
  children: JSX.Element;
} & ClassProps) {
  return (
    <div class={cx("flex shrink-0 items-center gap-1", className(props))}>
      {props.children}
    </div>
  );
}

export function AttachmentAction(props: {
  children: JSX.Element;
  label: string;
  onClick?: () => void;
} & ClassProps) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      class={cx(
        "rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-subtle)] transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)]",
        className(props)
      )}
    >
      {props.children}
    </button>
  );
}
