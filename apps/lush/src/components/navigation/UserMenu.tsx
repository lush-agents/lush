import { For } from "solid-js";
import { accountRoutes, getInitials } from "../../lib/app-data";
import { Dropdown } from "../../ui/Dropdown";

export function UserMenu(props: {
  open: boolean;
  displayName: string;
  handle: string;
  organizationName: string;
  onOpenChange: (open: boolean) => void;
  onNavigate: (href: string) => void;
}) {
  return (
    <div class="pb-6 pt-6">
      <Dropdown
        open={props.open}
        onOpenChange={props.onOpenChange}
        class="relative min-w-0"
        contentClass="absolute bottom-[calc(100%+0.5rem)] left-0 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-1 shadow-2xl shadow-[var(--shadow-menu)]"
        trigger={(dropdown) => (
          <button
            type="button"
            aria-expanded={dropdown.isOpen()}
            onClick={dropdown.toggle}
            class="flex w-full min-w-0 items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-2 text-left transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-panel-hover)]"
          >
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)] text-sm font-semibold text-white">
              {getInitials(props.displayName)}
            </span>
            <span class="min-w-0">
              <span class="block truncate text-xs font-medium text-[var(--color-text)]">
                {props.displayName}
              </span>
              <span class="block truncate text-xs text-[var(--color-muted)]">
                {props.handle} · {props.organizationName}
              </span>
            </span>
          </button>
        )}
      >
        <For each={accountRoutes}>
          {(route) => (
            <button
              type="button"
              onClick={() => props.onNavigate(route.href)}
              class="block w-full rounded-md px-3 py-2 text-left text-xs font-medium text-[var(--color-subtle)] transition hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)]"
            >
              {route.label}
            </button>
          )}
        </For>
      </Dropdown>
    </div>
  );
}
