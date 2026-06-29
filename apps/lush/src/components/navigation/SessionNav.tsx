import { For } from "solid-js";
import { previousSessions } from "../../lib/app-data";
import type { Route } from "../../lib/types";

export function SessionNav(props: {
  route: Route;
  onNavigate: (href: string) => void;
}) {
  const sessionKind = props.route.sessionKind ?? "workspace";
  const sessions = previousSessions[sessionKind] ?? [];

  return (
    <>
      <button
        type="button"
        onClick={() => props.onNavigate(props.route.href)}
        class="mb-3 block w-full rounded-md border border-[var(--color-brand)] bg-[var(--color-brand)] px-3 py-1.5 text-left text-[0.625rem] font-medium text-white transition hover:border-[var(--color-brand-strong)] hover:bg-[var(--color-brand-strong)]"
      >
        New {sessionKind} session
      </button>

      <div class="mb-2 px-3 text-[0.5625rem] font-medium uppercase tracking-wide text-[var(--color-muted)]">
        Previous sessions
      </div>

      <For each={sessions}>
        {(session) => (
          <button
            type="button"
            onClick={() => props.onNavigate(props.route.href)}
            class="block w-full truncate rounded-md px-3 py-1.5 text-left text-[0.625rem] font-medium text-[var(--color-subtle)] transition hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)]"
          >
            {session}
          </button>
        )}
      </For>
    </>
  );
}
