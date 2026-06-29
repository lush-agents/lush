import { createMemo, createSignal, For, Show } from "solid-js";
import type {
  AddInferenceProviderRequest,
  InferenceConfig,
  InferenceProviderKind,
  ModelDefaults,
  UserRole,
  WorkspaceMode
} from "@lush/api-client";
import { workspaceModes } from "../../lib/app-data";
import { Dropdown } from "../../ui/Dropdown";

type InferenceProvider = InferenceConfig["providers"][number];

const providerQuickstarts: Array<{
  kind: InferenceProviderKind;
  label: string;
  baseUrl: string;
  description: string;
}> = [
  {
    kind: "baseten",
    label: "Baseten",
    baseUrl: "https://inference.baseten.co/v1",
    description: "Use a Baseten OpenAI-compatible endpoint."
  },
  {
    kind: "fireworks",
    label: "Fireworks",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    description: "Discover Fireworks-hosted chat models."
  },
  {
    kind: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    description: "Discover Claude models with an Anthropic API key."
  },
  {
    kind: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    description: "Discover OpenAI chat-capable models."
  },
  {
    kind: "openai-compatible",
    label: "Other",
    baseUrl: "",
    description: "Connect any OpenAI-compatible API endpoint."
  }
];

export function InferenceSettingsPage(props: {
  currentRole?: UserRole;
  inferenceConfig?: InferenceConfig;
  modelDefaults: ModelDefaults;
  inferenceProviderError: string;
  isAddingInferenceProvider: boolean;
  onAddInferenceProvider: (
    request: AddInferenceProviderRequest
  ) => Promise<unknown>;
  onProviderEnabledChange: (
    providerId: string,
    enabled: boolean
  ) => Promise<unknown>;
  onProviderDelete: (providerId: string) => Promise<unknown>;
  onModelEnabledChange: (
    providerId: string,
    modelId: string,
    enabled: boolean
  ) => Promise<unknown>;
  onModelDefaultChange: (
    mode: WorkspaceMode,
    modelSelection: string
  ) => Promise<unknown>;
}) {
  const isAdmin = createMemo(() => props.currentRole === "admin");
  const [providerFormOpen, setProviderFormOpen] = createSignal(false);
  const [providerKind, setProviderKind] =
    createSignal<InferenceProviderKind>("fireworks");
  const [providerLabel, setProviderLabel] = createSignal("Fireworks");
  const [providerBaseUrl, setProviderBaseUrl] = createSignal(
    "https://api.fireworks.ai/inference/v1"
  );
  const [providerApiKey, setProviderApiKey] = createSignal("");
  const [openModelMenu, setOpenModelMenu] = createSignal("");
  const [providerPendingDeletion, setProviderPendingDeletion] =
    createSignal<InferenceProvider>();
  const selectedQuickstart = createMemo(() =>
    providerQuickstarts.find((quickstart) => quickstart.kind === providerKind())
  );
  const hasProviders = createMemo(
    () => (props.inferenceConfig?.providers.length ?? 0) > 0
  );

  const selectQuickstart = (kind: InferenceProviderKind) => {
    const quickstart = providerQuickstarts.find((item) => item.kind === kind);
    if (!quickstart) {
      return;
    }

    setProviderKind(quickstart.kind);
    setProviderLabel(quickstart.label);
    setProviderBaseUrl(quickstart.baseUrl);
  };

  const submitProvider = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!isAdmin()) {
      return;
    }

    await props.onAddInferenceProvider({
      kind: providerKind(),
      label: providerLabel(),
      apiKey: providerApiKey(),
      baseUrl: providerBaseUrl()
    });

    setProviderApiKey("");
    setProviderFormOpen(false);
  };

  const confirmProviderDelete = async () => {
    const provider = providerPendingDeletion();
    if (!provider) {
      return;
    }

    await props.onProviderDelete(provider.id);
    setProviderPendingDeletion(undefined);
  };

  return (
    <div class="grid max-w-3xl gap-4">
      <section class="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div class="max-w-md">
              <h2 class="text-sm font-medium text-[var(--color-text)]">
                Inference
              </h2>
              <p class="mt-1 text-sm leading-5 text-[var(--color-muted)]">
                {isAdmin()
                  ? "Connect providers and choose default models."
                  : "View connected providers and model defaults."}
              </p>
            </div>

            <Show when={isAdmin()}>
              <button
                type="button"
                onClick={() => setProviderFormOpen((open) => !open)}
                class="self-start rounded-md border border-[var(--color-brand)] bg-[var(--color-brand)] px-3 py-2 text-sm font-medium text-white transition hover:border-[var(--color-brand-strong)] hover:bg-[var(--color-brand-strong)]"
              >
                Add provider
              </button>
            </Show>
          </div>

          <Show when={providerFormOpen() && isAdmin()}>
            <form
              onSubmit={submitProvider}
              class="grid gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-3"
            >
              <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <For each={providerQuickstarts}>
                  {(quickstart) => (
                    <button
                      type="button"
                      onClick={() => selectQuickstart(quickstart.kind)}
                      class={`rounded-md border p-3 text-left transition ${
                        providerKind() === quickstart.kind
                          ? "border-[var(--color-brand)] bg-[var(--color-panel-hover)]"
                          : "border-[var(--color-border)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-panel-hover)]"
                      }`}
                    >
                      <span class="block text-sm font-medium text-[var(--color-text)]">
                        {quickstart.label}
                      </span>
                      <span class="mt-1 block text-xs leading-5 text-[var(--color-muted)]">
                        {quickstart.description}
                      </span>
                    </button>
                  )}
                </For>
              </div>

              <div class="grid gap-3 lg:grid-cols-3">
                <label class="grid gap-2">
                  <span class="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                    Provider name
                  </span>
                  <input
                    type="text"
                    value={providerLabel()}
                    onInput={(event) =>
                      setProviderLabel(event.currentTarget.value)
                    }
                    class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-muted)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand)]"
                  />
                </label>

                <label class="grid gap-2">
                  <span class="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                    API key
                  </span>
                  <input
                    type="password"
                    value={providerApiKey()}
                    onInput={(event) =>
                      setProviderApiKey(event.currentTarget.value)
                    }
                    placeholder="Paste API key, stored securely"
                    class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-muted)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand)]"
                  />
                </label>

                <label class="grid gap-2">
                  <span class="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                    Base URL
                  </span>
                  <input
                    type="url"
                    value={providerBaseUrl()}
                    onInput={(event) =>
                      setProviderBaseUrl(event.currentTarget.value)
                    }
                    placeholder={
                      selectedQuickstart()?.kind === "openai-compatible"
                        ? "https://api.example.com/v1"
                        : selectedQuickstart()?.baseUrl
                    }
                    class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-muted)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand)]"
                  />
                </label>
              </div>

              <Show when={props.inferenceProviderError}>
                <p class="text-sm text-[var(--color-brand-soft)]">
                  {props.inferenceProviderError}
                </p>
              </Show>

              <div class="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setProviderFormOpen(false)}
                  class="rounded-md border border-[var(--color-border-strong)] px-3 py-2 text-sm text-[var(--color-text)] transition hover:bg-[var(--color-panel-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    props.isAddingInferenceProvider ||
                    !providerLabel().trim() ||
                    !providerApiKey().trim() ||
                    !providerBaseUrl().trim()
                  }
                  class="rounded-md border border-[var(--color-brand)] bg-[var(--color-brand)] px-3 py-2 text-sm font-medium text-white transition hover:border-[var(--color-brand-strong)] hover:bg-[var(--color-brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {props.isAddingInferenceProvider
                    ? "Discovering models"
                    : "Connect provider"}
                </button>
              </div>
            </form>
          </Show>

          <div class="grid gap-2">
            <Show
              when={props.inferenceConfig}
              fallback={
                <Show when={!providerFormOpen()}>
                  <EmptyProviders
                    readOnly={!isAdmin()}
                    onAdd={() => setProviderFormOpen(true)}
                  />
                </Show>
              }
            >
              {(config) => (
                <Show
                  when={hasProviders()}
                  fallback={
                    <Show when={!providerFormOpen()}>
                      <EmptyProviders
                        readOnly={!isAdmin()}
                        onAdd={() => setProviderFormOpen(true)}
                      />
                    </Show>
                  }
                >
                  <For each={config().providers}>
                    {(provider) => (
                      <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)]">
                        <div
                          class={`flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-start sm:justify-between ${
                            provider.enabled
                              ? "border-b border-[var(--color-border)]"
                              : ""
                          }`}
                        >
                          <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-2">
                              <h3 class="text-sm font-medium text-[var(--color-text)]">
                                {provider.label}
                              </h3>
                              <span
                                class={`rounded-md px-2 py-1 text-xs font-medium ${
                                  provider.enabled
                                    ? "bg-[var(--color-brand)] text-white"
                                    : "bg-[var(--color-bg)] text-[var(--color-muted)]"
                                }`}
                              >
                                {provider.enabled ? "Enabled" : "Disabled"}
                              </span>
                            </div>
                            <p class="mt-1 truncate text-xs text-[var(--color-muted)]">
                              {provider.baseUrl}
                            </p>
                          </div>
                          <div class="flex flex-wrap items-center gap-2">
                            <span
                              class={`rounded-md px-2 py-1 text-xs font-medium ${
                                provider.configured
                                  ? "bg-[var(--color-card)] text-[var(--color-subtle)]"
                                  : "bg-[var(--color-bg)] text-[var(--color-muted)]"
                              }`}
                            >
                              {provider.configured ? "Configured" : "Missing key"}
                            </span>
                            <Show when={isAdmin()}>
                              <ToggleSwitch
                                checked={provider.enabled}
                                label={`${provider.enabled ? "Disable" : "Enable"} ${provider.label}`}
                                onChange={() =>
                                  void props.onProviderEnabledChange(
                                    provider.id,
                                    !provider.enabled
                                  )
                                }
                              />
                              <button
                                type="button"
                                onClick={() => setProviderPendingDeletion(provider)}
                                class="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-muted)] transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)]"
                              >
                                Delete
                              </button>
                            </Show>
                          </div>
                        </div>

                        <Show when={provider.enabled}>
                          <div class="grid divide-y divide-[var(--color-border)]">
                            <For each={provider.models}>
                              {(model) => {
                                const modelSelection = `${provider.id}:${model.id}`;
                                const selectedModes = () =>
                                  workspaceModes.filter(
                                    (mode) =>
                                      props.modelDefaults[mode.value] ===
                                      modelSelection
                                  );
                                const menuOpen = () =>
                                  openModelMenu() === modelSelection;

                                return (
                                  <div
                                    class={`grid gap-3 px-3 py-3 sm:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center ${
                                      model.enabled ? "" : "opacity-60"
                                    }`}
                                  >
                                    <Show
                                      when={isAdmin()}
                                      fallback={
                                        <span
                                          class={`rounded-md border px-2 py-1 text-xs font-medium ${
                                            model.enabled
                                              ? "border-[var(--color-brand)] text-[var(--color-brand-soft)]"
                                              : "border-[var(--color-border)] text-[var(--color-muted)]"
                                          }`}
                                        >
                                          {model.enabled ? "Enabled" : "Disabled"}
                                        </span>
                                      }
                                    >
                                      <ToggleSwitch
                                        checked={model.enabled}
                                        label={`${model.enabled ? "Disable" : "Enable"} ${model.label}`}
                                        onChange={() =>
                                          void props.onModelEnabledChange(
                                            provider.id,
                                            model.id,
                                            !model.enabled
                                          )
                                        }
                                      />
                                    </Show>

                                    <div class="min-w-0">
                                      <div class="flex flex-wrap items-center gap-2">
                                        <p class="text-sm font-medium text-[var(--color-text)]">
                                          {model.label}
                                        </p>
                                        <span class="rounded-md bg-[var(--color-card)] px-2 py-1 text-xs font-medium text-[var(--color-muted)]">
                                          {model.enabled ? "Enabled" : "Disabled"}
                                        </span>
                                      </div>
                                      <p class="mt-1 truncate text-xs text-[var(--color-muted)]">
                                        {model.id}
                                      </p>
                                    </div>

                                    <div class="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                                      <For each={selectedModes()}>
                                        {(mode) => (
                                          <span class="rounded-md border border-[var(--color-brand)] bg-[var(--color-brand)] px-2 py-1 text-xs font-medium text-white">
                                            {mode.label}
                                          </span>
                                        )}
                                      </For>

                                      <Show when={isAdmin()}>
                                        <Dropdown
                                          open={menuOpen()}
                                          onOpenChange={(open) =>
                                            setOpenModelMenu(
                                              open ? modelSelection : ""
                                            )
                                          }
                                          class="relative"
                                          contentClass="absolute right-0 top-8 z-20 min-w-48 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-1 shadow-lg"
                                          trigger={(dropdown) => (
                                            <button
                                              type="button"
                                              aria-label={`Model actions for ${model.label}`}
                                              aria-expanded={dropdown.isOpen()}
                                              disabled={!model.enabled}
                                              onClick={dropdown.toggle}
                                              class="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-muted)] transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                              <span class="grid gap-0.5">
                                                <span class="h-1 w-1 rounded-full bg-current" />
                                                <span class="h-1 w-1 rounded-full bg-current" />
                                                <span class="h-1 w-1 rounded-full bg-current" />
                                              </span>
                                            </button>
                                          )}
                                        >
                                          <div class="px-2 py-1.5 text-xs font-medium text-[var(--color-muted)]">
                                            Set default as...
                                          </div>
                                          <For each={workspaceModes}>
                                            {(mode) => (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  props.onModelDefaultChange(
                                                    mode.value,
                                                    modelSelection
                                                  );
                                                  setOpenModelMenu("");
                                                }}
                                                class="block w-full rounded px-2 py-1.5 text-left text-xs font-medium text-[var(--color-text)] transition hover:bg-[var(--color-panel-hover)]"
                                              >
                                                {mode.label}
                                              </button>
                                            )}
                                          </For>
                                        </Dropdown>
                                      </Show>
                                    </div>
                                  </div>
                                );
                              }}
                            </For>
                          </div>
                        </Show>
                      </div>
                    )}
                  </For>
                </Show>
              )}
            </Show>
          </div>
        </div>
      </section>

      <Show when={providerPendingDeletion()}>
        {(provider) => (
          <ProviderDeleteModal
            providerLabel={provider().label}
            onCancel={() => setProviderPendingDeletion(undefined)}
            onConfirm={() => void confirmProviderDelete()}
          />
        )}
      </Show>
    </div>
  );
}

function ProviderDeleteModal(props: {
  providerLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-provider-title"
        class="grid w-full max-w-sm gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 shadow-2xl shadow-[var(--shadow-menu)]"
      >
        <div>
          <h2
            id="delete-provider-title"
            class="text-sm font-semibold text-[var(--color-text)]"
          >
            Delete provider?
          </h2>
          <p class="mt-2 text-sm leading-5 text-[var(--color-muted)]">
            This permanently removes {props.providerLabel} and its discovered
            models from this organization.
          </p>
        </div>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            onClick={props.onCancel}
            class="rounded-md border border-[var(--color-border-strong)] px-3 py-2 text-sm text-[var(--color-text)] transition hover:bg-[var(--color-panel-hover)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            class="rounded-md border border-red-700 bg-red-700 px-3 py-2 text-sm font-medium text-white transition hover:border-red-800 hover:bg-red-800"
          >
            Delete provider
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyProviders(props: { readOnly: boolean; onAdd: () => void }) {
  return (
    <div class="rounded-lg border border-dashed border-[var(--color-border-strong)] bg-[var(--color-panel)] p-6 text-center">
      <p class="text-sm font-medium text-[var(--color-text)]">
        No inference providers connected
      </p>
      <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--color-muted)]">
        {props.readOnly
          ? "Ask an organization admin to connect a provider before using organization models."
          : "Add Baseten, Fireworks, Anthropic, OpenAI, or any OpenAI-compatible endpoint. Lush will use the supplied credentials to discover available chat models."}
      </p>
      <Show when={!props.readOnly}>
        <button
          type="button"
          onClick={props.onAdd}
          class="mt-4 rounded-md border border-[var(--color-border-strong)] px-3 py-2 text-sm text-[var(--color-text)] transition hover:bg-[var(--color-panel-hover)]"
        >
          Add provider
        </button>
      </Show>
    </div>
  );
}

function ToggleSwitch(props: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      onClick={props.onChange}
      class={`group relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 transition duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-panel)] ${
        props.checked
          ? "border-[var(--color-brand)] bg-[var(--color-brand)]"
          : "border-[var(--color-border-strong)] bg-[var(--color-card)] hover:bg-[var(--color-panel-hover)]"
      }`}
    >
      <span
        class={`h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
          props.checked ? "translate-x-[20px]" : "translate-x-0"
        }`}
      />
    </button>
  );
}
