import {
  type AddInferenceProviderRequest,
  createInferenceProvider,
  createDevSession,
  deleteInferenceProvider,
  fetchInferenceConfig,
  updateInferenceModelDefault,
  type InferenceConfig,
  updateInferenceModel,
  updateInferenceProvider,
  type WorkspaceMode
} from "@lush/api-client";
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show
} from "solid-js";
import logoUrl from "./assets/lush-logo.svg?url";
import { PrimaryNav } from "./components/navigation/PrimaryNav";
import { SessionNav } from "./components/navigation/SessionNav";
import { UserMenu } from "./components/navigation/UserMenu";
import {
  accountRoutes,
  concepts,
  defaultModelDefaults,
  formatHandle,
  getInitialDisplayName,
  getInitialHandle,
  getInitialApiBaseUrl,
  getInitialOrganizationName,
  getInitialSessionToken,
  getInitialAppearance,
  getSystemTheme,
  normalizedPath,
  resolveApiBaseUrl,
  resolveDisplayName,
  resolveOrganizationName,
  routes
} from "./lib/app-data";
import type { Appearance, SessionStatus } from "./lib/types";
import { ChatPage } from "./routes/chat/ChatPage";
import { ConceptDetailPage } from "./routes/concepts/ConceptDetailPage";
import { ConceptsPage } from "./routes/concepts/ConceptsPage";
import { NotFoundPage } from "./routes/NotFoundPage";
import { OrganizationSettingsPage } from "./routes/settings/OrganizationSettingsPage";
import { PersonalSettingsPage } from "./routes/settings/PersonalSettingsPage";
import { RoutePlaceholderPage } from "./routes/RoutePlaceholderPage";
import { ScrollFade } from "./ui/ScrollFade";

export function App() {
  const [path, setPath] = createSignal(normalizedPath());
  const [userMenuOpen, setUserMenuOpen] = createSignal(false);
  const [appearance, setAppearanceSignal] =
    createSignal<Appearance>(getInitialAppearance());
  const [systemTheme, setSystemTheme] = createSignal(getSystemTheme());
  const [displayName, setDisplayNameSignal] =
    createSignal(getInitialDisplayName());
  const [handle, setHandleSignal] = createSignal(getInitialHandle());
  const [apiBaseUrl, setApiBaseUrlSignal] = createSignal(getInitialApiBaseUrl());
  const [sessionToken, setSessionToken] = createSignal(getInitialSessionToken());
  const [sessionStatus, setSessionStatus] = createSignal<SessionStatus>(
    sessionToken() ? "ready" : "signed-out"
  );
  const [inferenceConfig, setInferenceConfig] =
    createSignal<InferenceConfig>();
  const [inferenceProviderError, setInferenceProviderError] = createSignal("");
  const [isAddingInferenceProvider, setIsAddingInferenceProvider] =
    createSignal(false);
  const [organizationName, setOrganizationNameSignal] =
    createSignal(getInitialOrganizationName());

  const activeRoute = createMemo(() => {
    const currentPath = path();
    return [...routes, ...accountRoutes].find((route) => route.href === currentPath);
  });
  const activeWorkspaceRoute = createMemo(() => {
    const route = activeRoute();
    return route?.sessionKind ? route : undefined;
  });
  const activeConcept = createMemo(() => {
    const match = path().match(/^\/concepts\/([^/]+)$/);
    return match ? concepts.find((concept) => concept.slug === match[1]) : undefined;
  });
  const isConceptsIndex = createMemo(() => path() === "/concepts");
  const resolvedTheme = createMemo(() =>
    appearance() === "system" ? systemTheme() : appearance()
  );
  const resolvedDisplayName = createMemo(() =>
    resolveDisplayName(displayName())
  );
  const formattedHandle = createMemo(() => formatHandle(handle()));
  const resolvedApiBaseUrl = createMemo(() => resolveApiBaseUrl(apiBaseUrl()));
  const resolvedOrganizationName = createMemo(() =>
    resolveOrganizationName(organizationName())
  );

  const setAppearance = (nextAppearance: Appearance) => {
    setAppearanceSignal(nextAppearance);
    window.localStorage.setItem("lush:appearance", nextAppearance);
  };

  const setDisplayName = (nextDisplayName: string) => {
    setDisplayNameSignal(nextDisplayName);
    window.localStorage.setItem("lush:display-name", nextDisplayName);
  };

  const setHandle = (nextHandle: string) => {
    setHandleSignal(nextHandle);
    window.localStorage.setItem("lush:handle", nextHandle);
  };

  const setApiBaseUrl = (nextApiBaseUrl: string) => {
    setApiBaseUrlSignal(nextApiBaseUrl);
    window.localStorage.setItem("lush:api-base-url", nextApiBaseUrl);
    setSessionToken("");
    setSessionStatus("signed-out");
    setInferenceConfig(undefined);
    window.localStorage.setItem("lush:session-token", "");
  };

  const setOrganizationName = (nextOrganizationName: string) => {
    setOrganizationNameSignal(nextOrganizationName);
    window.localStorage.setItem(
      "lush:organization-name",
      nextOrganizationName
    );
  };

  const modelDefaults = createMemo(
    () => inferenceConfig()?.modelDefaults ?? defaultModelDefaults
  );
  const enabledInferenceProviders = createMemo(() =>
    (inferenceConfig()?.providers ?? [])
      .filter((provider) => provider.enabled)
      .map((provider) => ({
        ...provider,
        models: provider.models.filter((model) => model.enabled)
      }))
      .filter((provider) => provider.models.length > 0)
  );

  const setModelDefault = async (
    mode: WorkspaceMode,
    modelSelection: string
  ) => {
    setInferenceProviderError("");

    try {
      const token = await ensureSession();
      const config = await updateInferenceModelDefault(
        resolvedApiBaseUrl(),
        token,
        {
          mode,
          modelSelection
        }
      );
      applyInferenceConfig(config);
    } catch (error) {
      setInferenceProviderError(
        error instanceof Error ? error.message : "Unable to update model default"
      );
    }
  };

  const applyInferenceConfig = (
    config: InferenceConfig
  ) => {
    setInferenceConfig(config);
  };

  const ensureSession = async (force = false) => {
    if (!force && sessionToken()) {
      return sessionToken();
    }

    setSessionStatus("loading");

    try {
      const session = await createDevSession(resolvedApiBaseUrl(), {
        displayName: resolvedDisplayName(),
        handle: formattedHandle(),
        organizationName: resolvedOrganizationName()
      });

      setSessionToken(session.token);
      window.localStorage.setItem("lush:session-token", session.token);
      setSessionStatus("ready");

      return session.token;
    } catch (error) {
      setSessionStatus("error");
      throw error;
    }
  };

  const connectApi = async () => {
    setInferenceConfig(undefined);

    try {
      const token = await ensureSession(true);
      const config = await fetchInferenceConfig(resolvedApiBaseUrl(), token);
      applyInferenceConfig(config);
    } catch {
      setInferenceConfig(undefined);
    }
  };

  const addInferenceProvider = async (request: AddInferenceProviderRequest) => {
    setInferenceProviderError("");
    setIsAddingInferenceProvider(true);

    try {
      const token = await ensureSession();
      await createInferenceProvider(resolvedApiBaseUrl(), token, request);
      const config = await fetchInferenceConfig(resolvedApiBaseUrl(), token);
      applyInferenceConfig(config);
    } catch (error) {
      setInferenceProviderError(
        error instanceof Error ? error.message : "Unable to add provider"
      );
      throw error;
    } finally {
      setIsAddingInferenceProvider(false);
    }
  };

  const setInferenceProviderEnabled = async (
    providerId: string,
    enabled: boolean
  ) => {
    setInferenceProviderError("");

    try {
      const token = await ensureSession();
      const config = await updateInferenceProvider(resolvedApiBaseUrl(), token, {
        providerId,
        enabled
      });
      applyInferenceConfig(config);
    } catch (error) {
      setInferenceProviderError(
        error instanceof Error ? error.message : "Unable to update provider"
      );
    }
  };

  const setInferenceModelEnabled = async (
    providerId: string,
    modelId: string,
    enabled: boolean
  ) => {
    setInferenceProviderError("");

    try {
      const token = await ensureSession();
      const config = await updateInferenceModel(resolvedApiBaseUrl(), token, {
        providerId,
        modelId,
        enabled
      });
      applyInferenceConfig(config);
    } catch (error) {
      setInferenceProviderError(
        error instanceof Error ? error.message : "Unable to update model"
      );
    }
  };

  const removeInferenceProvider = async (providerId: string) => {
    setInferenceProviderError("");

    try {
      const token = await ensureSession();
      const config = await deleteInferenceProvider(resolvedApiBaseUrl(), token, {
        providerId
      });
      applyInferenceConfig(config);
    } catch (error) {
      setInferenceProviderError(
        error instanceof Error ? error.message : "Unable to delete provider"
      );
    }
  };

  const navigate = (href: string) => {
    const nextPath = normalizedPath(href);
    if (nextPath !== path()) {
      window.history.pushState({}, "", nextPath);
      setPath(nextPath);
    }
    setUserMenuOpen(false);
  };

  const handleLink = (href: string) => (event: MouseEvent) => {
    event.preventDefault();
    navigate(href);
  };

  const handlePopState = () => {
    setPath(normalizedPath());
    setUserMenuOpen(false);
  };

  window.addEventListener("popstate", handlePopState);
  onCleanup(() => window.removeEventListener("popstate", handlePopState));

  const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
  const handleSystemThemeChange = () => setSystemTheme(getSystemTheme());
  mediaQuery.addEventListener("change", handleSystemThemeChange);
  onCleanup(() =>
    mediaQuery.removeEventListener("change", handleSystemThemeChange)
  );

  createEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme();
  });

  onMount(() => {
    void connectApi();
  });

  return (
    <main class="h-screen overflow-hidden bg-[var(--color-bg)] text-[var(--color-text)]">
      <section class="flex h-screen min-h-0 w-full flex-col px-6">
        <header class="flex h-20 shrink-0 items-center justify-between border-b border-[var(--color-border)]">
          <a
            href="/concepts"
            onClick={handleLink("/concepts")}
            class="flex items-center gap-3 text-sm font-semibold text-[var(--color-text)]"
          >
            <img src={logoUrl} alt="Lush" class="h-9 w-9" />
            <span>Lush</span>
            <Show when={activeWorkspaceRoute()}>
              {(route) => (
                <>
                  <span class="h-4 w-px bg-[var(--color-border-strong)]" />
                  <span class="rounded-md bg-[var(--color-panel)] px-2 py-1 text-xs font-medium text-[var(--color-subtle)]">
                    {route().label}
                  </span>
                </>
              )}
            </Show>
          </a>

          <button
            type="button"
            aria-label="Open Concepts"
            title="Concepts"
            onClick={() => navigate("/concepts")}
            class={`flex h-10 w-10 items-center justify-center rounded-full border text-lg font-medium transition ${
              path().startsWith("/concepts")
                ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-white"
                : "border-[var(--color-border-strong)] text-[var(--color-subtle)] hover:border-[var(--color-brand)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)]"
            }`}
          >
            ?
          </button>
        </header>

        <div class="grid min-h-0 flex-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside class="grid min-h-0 grid-rows-[1fr_auto] border-r border-[var(--color-border)] pr-6">
            <nav class="min-h-0 pt-6">
              <ScrollFade
                class="h-full"
                viewportClass="h-full overflow-y-auto"
                contentClass="space-y-1"
                top={false}
                bottom={false}
              >
                <Show
                  when={activeWorkspaceRoute()}
                  fallback={<PrimaryNav path={path()} onNavigate={navigate} />}
                >
                  {(route) => (
                    <SessionNav route={route()} onNavigate={navigate} />
                  )}
                </Show>
              </ScrollFade>
            </nav>

            <UserMenu
              open={userMenuOpen()}
              displayName={resolvedDisplayName()}
              handle={formattedHandle()}
              organizationName={resolvedOrganizationName()}
              onOpenChange={setUserMenuOpen}
              onNavigate={navigate}
            />
          </aside>

          <section class="min-h-0 overflow-y-auto py-8 pr-2">
            <Show when={activeRoute()}>
              {(route) => (
                <Show
                  when={route().href === "/chat"}
                  fallback={
                    <RoutePlaceholderPage route={route()}>
                      <Show when={route().href === "/settings/personal"}>
                        <PersonalSettingsPage
                          displayName={displayName()}
                          handle={handle()}
                          appearance={appearance()}
                          onDisplayNameChange={setDisplayName}
                          onHandleChange={setHandle}
                          onAppearanceChange={setAppearance}
                        />
                      </Show>
                      <Show when={route().href === "/settings/organization"}>
                        <OrganizationSettingsPage
                          organizationName={organizationName()}
                          apiBaseUrl={apiBaseUrl()}
                          sessionStatus={sessionStatus()}
                          inferenceConfig={inferenceConfig()}
                          modelDefaults={modelDefaults()}
                          inferenceProviderError={inferenceProviderError()}
                          isAddingInferenceProvider={isAddingInferenceProvider()}
                          onOrganizationNameChange={setOrganizationName}
                          onApiBaseUrlChange={setApiBaseUrl}
                          onApiBaseUrlBlur={connectApi}
                          onAddInferenceProvider={addInferenceProvider}
                          onProviderEnabledChange={setInferenceProviderEnabled}
                          onProviderDelete={removeInferenceProvider}
                          onModelEnabledChange={setInferenceModelEnabled}
                          onModelDefaultChange={setModelDefault}
                        />
                      </Show>
                    </RoutePlaceholderPage>
                  }
                >
                  <ChatPage
                    displayName={resolvedDisplayName()}
                    apiBaseUrl={resolvedApiBaseUrl()}
                    defaultModelSelection={modelDefaults().chat}
                    providers={enabledInferenceProviders()}
                    ensureSession={ensureSession}
                  />
                </Show>
              )}
            </Show>

            <Show when={isConceptsIndex()}>
              <ConceptsPage onNavigate={navigate} />
            </Show>

            <Show when={activeConcept()}>
              {(concept) => (
                <ConceptDetailPage
                  concept={concept()}
                  onNavigate={navigate}
                />
              )}
            </Show>

            <Show when={!activeRoute() && !isConceptsIndex() && !activeConcept()}>
              <NotFoundPage onNavigate={navigate} />
            </Show>
          </section>
        </div>
      </section>
    </main>
  );
}
