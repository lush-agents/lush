import { For } from "solid-js";
import type { OrganizationSummary } from "@lush/api-client";
import { accountRoutes, getInitials } from "../../lib/app-data";
import { Dropdown } from "../../ui/Dropdown";

export function UserMenu(props: {
  open: boolean;
  displayName: string;
  organizationName: string;
  activeOrganizationId?: string | null;
  organizations: OrganizationSummary[];
  onOpenChange: (open: boolean) => void;
  onNavigate: (href: string) => void;
  onOrganizationSwitch: (organizationId: string) => void;
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
            class="flex w-full min-w-0 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-2 text-left transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-panel-hover)]"
          >
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)] text-[0.6875rem] font-semibold text-white">
              {getInitials(props.displayName)}
            </span>
            <span class="min-w-0 flex-1 overflow-hidden">
              <span class="block truncate text-[0.6875rem] font-medium text-[var(--color-text)]">
                {props.displayName}
              </span>
              <span class="block truncate text-[0.6875rem] text-[var(--color-muted)]">
                {props.organizationName}
              </span>
            </span>
          </button>
        )}
      >
        <div class="border-b border-[var(--color-border)] pb-1">
          <For each={props.organizations}>
            {(organization) => (
              <button
                type="button"
                onClick={() => props.onOrganizationSwitch(organization.id)}
                disabled={organization.id === props.activeOrganizationId}
                class={`block w-full rounded-md px-3 py-1.5 text-left text-[0.625rem] font-medium transition ${
                  organization.id === props.activeOrganizationId
                    ? "bg-[var(--color-panel-hover)] text-[var(--color-text)]"
                    : "text-[var(--color-subtle)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)]"
                }`}
              >
                <span class="block truncate">{organization.name}</span>
                <span class="block text-[0.5625rem] uppercase tracking-wide text-[var(--color-muted)]">
                  {organization.role}
                </span>
              </button>
            )}
          </For>
          <button
            type="button"
            onClick={() => props.onNavigate("/organizations/new")}
            class="block w-full rounded-md px-3 py-1.5 text-left text-[0.625rem] font-medium text-[var(--color-subtle)] transition hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)]"
          >
            New organization
          </button>
        </div>

        <For each={accountRoutes}>
          {(route) => (
            <button
              type="button"
              onClick={() => props.onNavigate(route.href)}
              class="block w-full rounded-md px-3 py-1.5 text-left text-[0.625rem] font-medium text-[var(--color-subtle)] transition hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)]"
            >
              {route.label}
            </button>
          )}
        </For>
      </Dropdown>
    </div>
  );
}
