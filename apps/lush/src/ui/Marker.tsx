import type { JSX } from "solid-js";

export function Marker(props: {
  children: JSX.Element;
  tone?: "neutral" | "brand";
  class?: string;
}) {
  const toneClass =
    props.tone === "brand"
      ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-white"
      : "border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-muted)]";

  return (
    <span
      class={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${toneClass} ${
        props.class ?? ""
      }`}
    >
      {props.children}
    </span>
  );
}
