import { For } from "solid-js";
import { settingsRoutes } from "../../lib/app-data";

const personalSettings = settingsRoutes.filter(
  (route) =>
    route.href === "/settings/profile" || route.href === "/settings/appearance"
);
const organizationSettings = settingsRoutes.filter((route) =>
  route.href.startsWith("/settings/") &&
  route.href !== "/settings/profile" &&
  route.href !== "/settings/appearance"
);

export function SettingsNav(props: {
  path: string;
  backHref: string;
  onNavigate: (href: string) => void;
}) {
  return (
    <div class="space-y-6">
      <a
        href={props.backHref}
        onClick={(event) => {
          event.preventDefault();
          props.onNavigate(props.backHref);
        }}
        class="block px-3 py-1.5 text-[0.625rem] font-medium text-[var(--color-subtle)] transition hover:text-[var(--color-text)]"
      >
        ← Back to app
      </a>

      <SettingsSection
        title="Personal settings"
        routes={personalSettings}
        path={props.path}
        onNavigate={props.onNavigate}
      />

      <SettingsSection
        title="Organization settings"
        routes={organizationSettings}
        path={props.path}
        onNavigate={props.onNavigate}
      />
    </div>
  );
}

function SettingsSection(props: {
  title: string;
  routes: typeof settingsRoutes;
  path: string;
  onNavigate: (href: string) => void;
}) {
  return (
    <div>
      <div class="mb-2 px-3 text-[0.5625rem] font-medium uppercase tracking-wide text-[var(--color-muted)]">
        {props.title}
      </div>
      <div class="space-y-1">
        <For each={props.routes}>
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
      </div>
    </div>
  );
}
