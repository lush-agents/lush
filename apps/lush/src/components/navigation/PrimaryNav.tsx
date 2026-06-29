import { For } from "solid-js";
import { routes } from "../../lib/app-data";

export function PrimaryNav(props: {
  path: string;
  onNavigate: (href: string) => void;
}) {
  return (
    <For each={routes}>
      {(route) => (
        <a
          href={route.href}
          onClick={(event) => {
            event.preventDefault();
            props.onNavigate(route.href);
          }}
          aria-current={props.path === route.href ? "page" : undefined}
          class={`block rounded-md px-3 py-1.5 text-[0.625rem] font-medium transition ${
            props.path === route.href
              ? "bg-[var(--color-brand-strong)] text-white"
              : "text-[var(--color-subtle)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)]"
          }`}
        >
          {route.label}
        </a>
      )}
    </For>
  );
}
