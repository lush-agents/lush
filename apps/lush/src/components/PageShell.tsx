import { Show } from "solid-js";
import type { JSX } from "solid-js";

export function PageShell(props: {
  eyebrow: string;
  title: string;
  body: string;
  children?: JSX.Element;
  back?: {
    label: string;
    href: string;
  };
  onNavigate?: (href: string) => void;
}) {
  return (
    <div class="flex flex-col gap-6">
      <div class="max-w-2xl">
        <Show when={props.back && props.onNavigate}>
          <button
            type="button"
            onClick={() => props.onNavigate?.(props.back?.href ?? "/concepts")}
            class="mb-4 text-sm text-[var(--color-brand-soft)] hover:text-[var(--color-brand-softer)]"
          >
            {props.back?.label}
          </button>
        </Show>
        <p class="text-sm font-medium uppercase tracking-wide text-[var(--color-muted)]">
          {props.eyebrow}
        </p>
        <h1 class="mt-2 text-2xl font-semibold text-[var(--color-text)]">
          {props.title}
        </h1>
        <p class="mt-3 text-sm leading-6 text-[var(--color-muted)]">
          {props.body}
        </p>
      </div>
      {props.children}
    </div>
  );
}
