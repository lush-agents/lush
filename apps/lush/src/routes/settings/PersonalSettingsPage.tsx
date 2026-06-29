import { For } from "solid-js";
import { appearanceOptions } from "../../lib/app-data";
import type { Appearance } from "../../lib/types";

export function PersonalSettingsPage(props: {
  displayName: string;
  handle: string;
  appearance: Appearance;
  onDisplayNameChange: (displayName: string) => void;
  onHandleChange: (handle: string) => void;
  onAppearanceChange: (appearance: Appearance) => void;
}) {
  return (
    <div class="grid max-w-3xl gap-4">
      <section class="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="max-w-md">
            <h2 class="text-sm font-medium text-[var(--color-text)]">
              Profile
            </h2>
            <p class="mt-1 text-sm leading-5 text-[var(--color-muted)]">
              Set the local display name Lush uses in this app.
            </p>
          </div>

          <div class="grid min-w-64 gap-3">
            <label class="grid gap-2">
              <span class="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                Display name
              </span>
              <input
                type="text"
                value={props.displayName}
                onInput={(event) =>
                  props.onDisplayNameChange(event.currentTarget.value)
                }
                placeholder="First Last"
                class="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-muted)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand)]"
              />
            </label>

            <label class="grid gap-2">
              <span class="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                Handle
              </span>
              <div class="flex rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] transition hover:border-[var(--color-border-strong)] focus-within:border-[var(--color-brand)]">
                <span class="flex items-center px-3 text-sm text-[var(--color-muted)]">
                  @
                </span>
                <input
                  type="text"
                  value={props.handle.replace(/^@+/, "")}
                  onInput={(event) =>
                    props.onHandleChange(event.currentTarget.value)
                  }
                  placeholder="first"
                  class="min-w-0 flex-1 bg-transparent py-2 pr-3 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]"
                />
              </div>
            </label>
          </div>
        </div>
      </section>

      <section class="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="max-w-md">
            <h2 class="text-sm font-medium text-[var(--color-text)]">
              Appearance
            </h2>
            <p class="mt-1 text-sm leading-5 text-[var(--color-muted)]">
              Choose how Lush should render across this device.
            </p>
          </div>

          <div class="grid min-w-64 gap-2">
            <For each={appearanceOptions}>
              {(option) => (
                <label
                  class={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition ${
                    props.appearance === option.value
                      ? "border-[var(--color-brand)] bg-[var(--color-panel-hover)]"
                      : "border-[var(--color-border)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-panel-hover)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="appearance"
                    value={option.value}
                    checked={props.appearance === option.value}
                    onChange={() => props.onAppearanceChange(option.value)}
                    class="mt-1 accent-[var(--color-brand)]"
                  />
                  <span>
                    <span class="block text-sm font-medium text-[var(--color-text)]">
                      {option.label}
                    </span>
                    <span class="mt-1 block text-xs leading-5 text-[var(--color-muted)]">
                      {option.description}
                    </span>
                  </span>
                </label>
              )}
            </For>
          </div>
        </div>
      </section>
    </div>
  );
}
