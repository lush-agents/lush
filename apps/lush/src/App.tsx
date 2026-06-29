import {
  type AccessSession,
  type AddInferenceProviderRequest,
  createOrganization,
  createOrganizationInvite,
  createInferenceProvider,
  deleteCurrentOrganization,
  deleteInferenceProvider,
  fetchInferenceConfig,
  listOrganizationInvites,
  listOrganizationMembers,
  listOrganizations,
  login,
  logout,
  type OrganizationInvite,
  type OrganizationMember,
  type OrganizationSummary,
  openClientEvents,
  registerAccount,
  removeOrganizationMember,
  refreshSession,
  switchOrganization,
  updateCurrentOrganization,
  updateInferenceModelDefault,
  type InferenceConfig,
  updateInferenceModel,
  updateInferenceProvider,
  updateOrganizationMemberRole,
  updateCurrentUser,
  type UserRole,
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
import { SettingsNav } from "./components/navigation/SettingsNav";
import { UserMenu } from "./components/navigation/UserMenu";
import {
  accountRoutes,
  concepts,
  defaultModelDefaults,
  getInitialDisplayName,
  getInitialOrganizationName,
  getInitialAppearance,
  getSystemTheme,
  normalizedPath,
  resolveApiBaseUrl,
  resolveDisplayName,
  resolveOrganizationName,
  routes,
  settingsRoutes
} from "./lib/app-data";
import {
  type AccessTokenClaims,
  accessTokenExpiresSoon,
  clearCachedAccessSession,
  normalizeAccessSession,
  parseAccessTokenClaims,
  readCachedAccessSession,
  refreshAccessSession,
  withTokenRefresh,
  writeCachedAccessSession
} from "./lib/api-session";
import type { Appearance, SessionStatus } from "./lib/types";
import { ChatPage } from "./routes/chat/ChatPage";
import { ConceptDetailPage } from "./routes/concepts/ConceptDetailPage";
import { ConceptsPage } from "./routes/concepts/ConceptsPage";
import { NotFoundPage } from "./routes/NotFoundPage";
import { InferenceSettingsPage } from "./routes/settings/InferenceSettingsPage";
import { OrganizationSettingsPage } from "./routes/settings/OrganizationSettingsPage";
import { PersonalSettingsPage } from "./routes/settings/PersonalSettingsPage";
import { RoutePlaceholderPage } from "./routes/RoutePlaceholderPage";
import { ScrollFade } from "./ui/ScrollFade";

export function App() {
  let sessionRequestId = 0;
  let clientEventRefresh: Promise<void> | undefined;
  const [path, setPath] = createSignal(normalizedPath());
  const [lastAppPath, setLastAppPath] = createSignal("/concepts");
  const [userMenuOpen, setUserMenuOpen] = createSignal(false);
  const [authEmail, setAuthEmail] = createSignal("");
  const [authPassword, setAuthPassword] = createSignal("");
  const [authError, setAuthError] = createSignal("");
  const [appearance, setAppearanceSignal] =
    createSignal<Appearance>(getInitialAppearance());
  const [systemTheme, setSystemTheme] = createSignal(getSystemTheme());
  const [displayName, setDisplayNameSignal] =
    createSignal(getInitialDisplayName());
  const [sessionToken, setSessionToken] = createSignal("");
  const [sessionTokenExpiresAt, setSessionTokenExpiresAt] = createSignal("");
  const [sessionClaims, setSessionClaims] = createSignal<AccessTokenClaims>();
  const [sessionStatus, setSessionStatus] =
    createSignal<SessionStatus>("loading");
  const [inferenceConfig, setInferenceConfig] =
    createSignal<InferenceConfig>();
  const [organizations, setOrganizations] = createSignal<OrganizationSummary[]>([]);
  const [organizationMembers, setOrganizationMembers] =
    createSignal<OrganizationMember[]>([]);
  const [organizationInvites, setOrganizationInvites] =
    createSignal<OrganizationInvite[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = createSignal<string | null>(null);
  const [membershipRole, setMembershipRole] = createSignal<UserRole>();
  const [organizationError, setOrganizationError] = createSignal("");
  const [inferenceProviderError, setInferenceProviderError] = createSignal("");
  const [isAddingInferenceProvider, setIsAddingInferenceProvider] =
    createSignal(false);
  const [organizationName, setOrganizationNameSignal] =
    createSignal(getInitialOrganizationName());

  const activeRoute = createMemo(() => {
    const currentPath = path();
    return [...routes, ...settingsRoutes, ...accountRoutes].find(
      (route) => route.href === currentPath
    );
  });
  const activeWorkspaceRoute = createMemo(() => {
    const route = activeRoute();
    return route?.sessionKind ? route : undefined;
  });
  const activeConcept = createMemo(() => {
    const match = path().match(/^\/concepts\/([^/]+)$/);
    return match ? concepts.find((concept) => concept.slug === match[1]) : undefined;
  });
  const authMode = createMemo<"login" | "register">(() =>
    path() === "/register" ? "register" : "login"
  );
  const isAppBaseRoute = createMemo(() => path() === "/");
  const isAuthRoute = createMemo(() => isPublicAuthRoute(path()));
  const isConceptsIndex = createMemo(() => path() === "/concepts");
  const isCreateOrganizationRoute = createMemo(() => path() === "/organizations/new");
  const isSettingsRoute = createMemo(() => path().startsWith("/settings/"));
  const hasActiveOrganization = createMemo(() => Boolean(sessionClaims()?.org));
  const resolvedTheme = createMemo(() =>
    appearance() === "system" ? systemTheme() : appearance()
  );
  const resolvedDisplayName = createMemo(() =>
    resolveDisplayName(displayName())
  );
  const apiBaseUrl = createMemo(() => resolveApiBaseUrl());
  const resolvedOrganizationName = createMemo(() =>
    organizationName().trim() ? resolveOrganizationName(organizationName()) : "No organization"
  );
  const isAuthenticated = createMemo(
    () => sessionStatus() === "ready"
  );
  const shouldShowAuthScreen = createMemo(
    () => !isAuthenticated() && isAuthRoute()
  );
  const shouldShowAppShell = createMemo(
    () => isAuthenticated() && !isAuthRoute() && !isAppBaseRoute()
  );

  const setAppearance = (nextAppearance: Appearance) => {
    setAppearanceSignal(nextAppearance);
    window.localStorage.setItem("lush:appearance", nextAppearance);
  };

  const setDisplayName = async (nextDisplayName: string) => {
    const previousDisplayName = displayName();
    const normalizedDisplayName = nextDisplayName.trim();

    if (!normalizedDisplayName) {
      setDisplayNameSignal(previousDisplayName);
      throw new Error("Display name is required");
    }

    if (normalizedDisplayName === previousDisplayName) {
      setDisplayNameSignal(normalizedDisplayName);
      return;
    }

    setDisplayNameSignal(normalizedDisplayName);

    try {
      await runAuthenticated((session) =>
        updateCurrentUser(apiBaseUrl(), session.accessToken, {
          displayName: normalizedDisplayName
        })
      );
      const refreshed = await refreshAppliedSession();
      await refreshOrganizationState(refreshed);
    } catch (error) {
      setDisplayNameSignal(previousDisplayName);
      throw error;
    }
  };

  const setOrganizationName = async (nextOrganizationName: string) => {
    const previousOrganizationName = organizationName();
    const normalizedOrganizationName = nextOrganizationName.trim();

    if (!normalizedOrganizationName) {
      setOrganizationNameSignal(previousOrganizationName);
      throw new Error("Organization name is required");
    }

    if (normalizedOrganizationName === previousOrganizationName) {
      setOrganizationNameSignal(normalizedOrganizationName);
      return;
    }

    setOrganizationNameSignal(normalizedOrganizationName);

    try {
      await runAuthenticated((session) =>
        updateCurrentOrganization(apiBaseUrl(), session.accessToken, {
          name: normalizedOrganizationName
        })
      );
      const refreshed = await refreshAppliedSession();
      await refreshOrganizationState(refreshed);
    } catch (error) {
      setOrganizationNameSignal(previousOrganizationName);
      throw error;
    }
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
      const config = await runAuthenticated((session) =>
        updateInferenceModelDefault(apiBaseUrl(), session.accessToken, {
          mode,
          modelSelection
        })
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

  const applySession = (accessSession: AccessSession) => {
    const normalized = normalizeAccessSession(accessSession);
    const claims = normalized.claims;
    setSessionToken(normalized.accessSession.accessToken);
    setSessionTokenExpiresAt(normalized.accessSession.accessTokenExpiresAt);
    setSessionClaims(claims);
    setDisplayNameSignal(claims.name);
    setOrganizationNameSignal(claims.org ? claims.org_name : "");
    setActiveOrganizationId(claims.org);
    setMembershipRole(claims.role ?? undefined);
    setSessionStatus("ready");
    writeCachedAccessSession(normalized.accessSession);
  };

  const refreshAppliedSession = async () => {
    return refreshAccessSession(apiBaseUrl(), applySession);
  };

  const runWithTokenRefresh = async <T,>(
    accessSession: AccessSession,
    operation: (session: AccessSession) => Promise<T>
  ) => {
    return withTokenRefresh(
      {
        apiBaseUrl: apiBaseUrl(),
        accessSession,
        applySession
      },
      operation
    );
  };

  const refreshOrganizationState = async (
    accessSession: AccessSession = currentAccessSession()
  ) => {
    const claims = parseAccessTokenClaims(accessSession.accessToken);
    if (!claims) {
      throw new Error("Invalid access token");
    }

    const organizationState = await runWithTokenRefresh(
      accessSession,
      (session) => listOrganizations(apiBaseUrl(), session.accessToken)
    );
    setOrganizations(organizationState.organizations);

    const activeClaims = sessionClaims() ?? claims;
    if (!activeClaims.org) {
      setOrganizationMembers([]);
      setOrganizationInvites([]);
      return;
    }

    const members = await runWithTokenRefresh(
      accessSession,
      (session) => listOrganizationMembers(apiBaseUrl(), session.accessToken)
    );
    setOrganizationMembers(members.members);

    if (activeClaims.role !== "admin") {
      setOrganizationInvites([]);
      return;
    }

    const invites = await runWithTokenRefresh(
      accessSession,
      (session) => listOrganizationInvites(apiBaseUrl(), session.accessToken)
    );
    setOrganizationInvites(invites.invites);
  };

  const fetchSessionInferenceConfig = async (
    accessSession: AccessSession
  ) => {
    const claims = parseAccessTokenClaims(accessSession.accessToken);
    if (!claims) {
      throw new Error("Invalid access token");
    }

    if (!claims.org || !claims.role) {
      setInferenceProviderError("");
      return undefined;
    }

    try {
      const config = await runWithTokenRefresh(accessSession, (session) =>
        fetchInferenceConfig(apiBaseUrl(), session.accessToken)
      );
      setInferenceProviderError("");
      return config;
    } catch (error) {
      setInferenceProviderError(
        error instanceof Error
          ? error.message
          : "Unable to load inference configuration"
      );
      return undefined;
    }
  };

  const currentAccessSession = (): AccessSession => {
    const claims = sessionClaims();
    const token = sessionCredential();
    const expiresAt = sessionTokenExpiresAt();
    if (!claims || !token || !expiresAt) {
      throw new Error("Sign in required");
    }

    return {
      accessToken: token,
      accessTokenExpiresAt: expiresAt,
      session: {
        sessionId: claims.sid,
        user: {
          id: claims.sub,
          email: claims.email,
          emailVerified: true,
          displayName: claims.name
        },
        organization: claims.org
          ? {
              id: claims.org,
              name: claims.org_name
            }
          : null,
        membership: claims.mid && claims.role
          ? {
              id: claims.mid,
              role: claims.role
            }
          : null,
        createdAt: "",
        expiresAt
      }
    };
  };

  const sessionCredential = () => sessionToken() || undefined;
  const sessionTokenExpiresSoon = () =>
    accessTokenExpiresSoon(sessionTokenExpiresAt());

  const replaceRoute = (href: string) => {
    const nextPath = normalizedPath(href);
    if (nextPath !== path() || window.location.pathname !== nextPath) {
      window.history.replaceState({}, "", nextPath);
    }
    setPath(nextPath);
    setUserMenuOpen(false);
  };

  const clearSessionState = () => {
    clearCachedAccessSession();
    setSessionToken("");
    setSessionTokenExpiresAt("");
    setSessionClaims(undefined);
    setSessionStatus("signed-out");
    setInferenceConfig(undefined);
    setOrganizations([]);
    setOrganizationMembers([]);
    setOrganizationInvites([]);
    setActiveOrganizationId(null);
    setMembershipRole(undefined);
  };

  const restoreSession = async () => {
    const requestId = ++sessionRequestId;
    setSessionStatus("loading");

    try {
      const cachedSession = readCachedAccessSession();
      if (cachedSession) {
        applySession(cachedSession);
        await refreshOrganizationState(cachedSession);
        const config = await fetchSessionInferenceConfig(cachedSession);
        if (requestId !== sessionRequestId) {
          return;
        }

        setInferenceConfig(config);
        return;
      }
    } catch {
      clearCachedAccessSession();
    }

    try {
      const session = await refreshSession(apiBaseUrl(), {});
      if (requestId !== sessionRequestId) {
        return;
      }

      applySession(session);
      await refreshOrganizationState(session);
      const config = await fetchSessionInferenceConfig(session);
      if (requestId === sessionRequestId) {
        setInferenceConfig(config);
      }
    } catch (error) {
      if (requestId === sessionRequestId) {
        clearSessionState();
      }
    }
  };

  const ensureSession = async (force = false) => {
    if (sessionStatus() !== "ready" || force || sessionTokenExpiresSoon()) {
      try {
        const session = await refreshSession(apiBaseUrl(), {});
        applySession(session);
      } catch (error) {
        clearSessionState();
        throw error;
      }
    }

    if (sessionStatus() !== "ready") {
      throw new Error("Sign in required");
    }

    return sessionCredential();
  };

  const runAuthenticated = async <T,>(
    operation: (session: AccessSession) => Promise<T>
  ) => {
    await ensureSession();
    return runWithTokenRefresh(currentAccessSession(), operation);
  };

  onMount(() => {
    void restoreSession();
  });

  const submitAuth = async (event: SubmitEvent) => {
    event.preventDefault();
    const requestId = ++sessionRequestId;
    setAuthError("");
    setSessionStatus("loading");

    try {
      if (authMode() === "register") {
        const pendingVerification = await registerAccount(apiBaseUrl(), {
          email: authEmail(),
          password: authPassword()
        });
        setAuthPassword("");
        clearSessionState();
        setAuthError(`Verify ${pendingVerification.email} before signing in.`);
        replaceRoute("/sign-in");
        return;
      }

      const session = await login(apiBaseUrl(), {
        email: authEmail(),
        password: authPassword()
      });
      if (requestId !== sessionRequestId) {
        return;
      }

      applySession(session);
      setAuthPassword("");
      await refreshOrganizationState(session);
      const config = await fetchSessionInferenceConfig(session);
      if (requestId === sessionRequestId) {
        setInferenceConfig(config);
      }
    } catch (error) {
      if (requestId === sessionRequestId) {
        clearSessionState();
        setAuthError(
          error instanceof Error
            ? error.message
            : authMode() === "register"
              ? "Unable to register"
              : "Unable to sign in"
        );
      }
    }
  };

  const signOut = async () => {
    sessionRequestId += 1;
    const token = sessionCredential();
    clearSessionState();
    replaceRoute("/sign-in");

    await logout(apiBaseUrl(), token, {}).catch(() => undefined);
  };

  const loadSessionData = async (accessSession: AccessSession) => {
    applySession(accessSession);
    await refreshOrganizationState(accessSession);
    const config = await fetchSessionInferenceConfig(accessSession);
    setInferenceConfig(config);
  };

  const refreshFromClientEvent = () => {
    clientEventRefresh ??= (async () => {
      try {
        const session = await refreshAppliedSession();
        await loadSessionData(session);
      } catch {
        clearSessionState();
        replaceRoute("/sign-in");
      } finally {
        clientEventRefresh = undefined;
      }
    })();

    return clientEventRefresh;
  };

  const connectClientEventStream = async (
    accessSession: AccessSession,
    signal: AbortSignal
  ) => {
    while (!signal.aborted) {
      try {
        const response = await openClientEvents(
          apiBaseUrl(),
          accessSession.accessToken,
          signal
        );

        if (response.status === 401) {
          await refreshFromClientEvent();
          return;
        }

        if (!response.ok || !response.body) {
          throw new Error(`Client events failed with ${response.status}`);
        }

        await readClientEventStream(response, signal, async (event) => {
          if (event.type === "auth.refresh_required") {
            await refreshFromClientEvent();
          }
        });
      } catch (error) {
        if (signal.aborted) {
          return;
        }
      }

      await delay(1000, signal);
    }
  };

  const switchActiveOrganization = async (organizationId: string) => {
    setOrganizationError("");

    try {
      const session = await runAuthenticated((current) =>
        switchOrganization(apiBaseUrl(), current.accessToken, {
          organizationId
        })
      );
      await loadSessionData(session);
      replaceRoute("/concepts");
    } catch (error) {
      setOrganizationError(
        error instanceof Error ? error.message : "Unable to switch organization"
      );
    }
  };

  const createNewOrganization = async (name: string) => {
    setOrganizationError("");

    try {
      const session = await runAuthenticated((current) =>
        createOrganization(apiBaseUrl(), current.accessToken, { name })
      );
      await loadSessionData(session);
      replaceRoute("/concepts");
    } catch (error) {
      setOrganizationError(
        error instanceof Error ? error.message : "Unable to create organization"
      );
      throw error;
    }
  };

  const deleteActiveOrganization = async () => {
    setOrganizationError("");

    try {
      const result = await runAuthenticated((current) =>
        deleteCurrentOrganization(apiBaseUrl(), current.accessToken, {})
      );
      await loadSessionData(result.nextSession);
      replaceRoute(result.requiresOrganization ? "/organizations/new" : "/concepts");
    } catch (error) {
      setOrganizationError(
        error instanceof Error ? error.message : "Unable to delete organization"
      );
      throw error;
    }
  };

  const inviteOrganizationMember = async (
    email: string,
    role: UserRole,
    expiresInDays?: number
  ) => {
    setOrganizationError("");

    try {
      await runAuthenticated((session) =>
        createOrganizationInvite(apiBaseUrl(), session.accessToken, {
          email,
          role,
          expiresInDays
        })
      );
      const invites = await runAuthenticated((session) =>
        listOrganizationInvites(apiBaseUrl(), session.accessToken)
      );
      setOrganizationInvites(invites.invites);
    } catch (error) {
      setOrganizationError(
        error instanceof Error ? error.message : "Unable to create invite"
      );
      throw error;
    }
  };

  const setOrganizationMemberRole = async (
    membershipId: string,
    role: UserRole
  ) => {
    setOrganizationError("");

    try {
      const members = await runAuthenticated((session) =>
        updateOrganizationMemberRole(apiBaseUrl(), session.accessToken, {
          membershipId,
          role
        })
      );
      setOrganizationMembers(members.members);
    } catch (error) {
      setOrganizationError(
        error instanceof Error ? error.message : "Unable to update member role"
      );
    }
  };

  const removeMemberFromOrganization = async (membershipId: string) => {
    setOrganizationError("");

    try {
      const members = await runAuthenticated((session) =>
        removeOrganizationMember(apiBaseUrl(), session.accessToken, {
          membershipId
        })
      );
      setOrganizationMembers(members.members);
    } catch (error) {
      setOrganizationError(
        error instanceof Error ? error.message : "Unable to remove member"
      );
    }
  };

  const addInferenceProvider = async (request: AddInferenceProviderRequest) => {
    setInferenceProviderError("");
    setIsAddingInferenceProvider(true);

    try {
      await runAuthenticated((session) =>
        createInferenceProvider(apiBaseUrl(), session.accessToken, request)
      );
      const config = await runAuthenticated((session) =>
        fetchInferenceConfig(apiBaseUrl(), session.accessToken)
      );
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
      const config = await runAuthenticated((session) =>
        updateInferenceProvider(apiBaseUrl(), session.accessToken, {
          providerId,
          enabled
        })
      );
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
      const config = await runAuthenticated((session) =>
        updateInferenceModel(apiBaseUrl(), session.accessToken, {
          providerId,
          modelId,
          enabled
        })
      );
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
      const config = await runAuthenticated((session) =>
        deleteInferenceProvider(apiBaseUrl(), session.accessToken, {
          providerId
        })
      );
      applyInferenceConfig(config);
    } catch (error) {
      setInferenceProviderError(
        error instanceof Error ? error.message : "Unable to delete provider"
      );
    }
  };

  const navigate = (href: string) => {
    const nextPath = normalizedPath(href);
    if (nextPath === "/sign-out") {
      void signOut();
      return;
    }

    if (nextPath !== path()) {
      window.history.pushState({}, "", nextPath);
      setPath(nextPath);
    }
    setUserMenuOpen(false);
  };

  createEffect(() => {
    const currentPath = path();

    if (
      currentPath !== "/" &&
      !currentPath.startsWith("/settings/") &&
      !isPublicAuthRoute(currentPath) &&
      currentPath !== "/organizations/new"
    ) {
      setLastAppPath(currentPath);
    }
  });

  createEffect(() => {
    const status = sessionStatus();
    const currentPath = path();

    if (status === "loading") {
      return;
    }

    if (status === "ready") {
      if (currentPath === "/settings/personal") {
        replaceRoute("/settings/profile");
        return;
      }

      if (currentPath === "/" || isPublicAuthRoute(currentPath)) {
        replaceRoute(hasActiveOrganization() ? "/concepts" : "/organizations/new");
        return;
      }

      if (!hasActiveOrganization() && currentPath !== "/organizations/new") {
        replaceRoute("/organizations/new");
      }
      return;
    }

    if (currentPath === "/" || !isPublicAuthRoute(currentPath)) {
      replaceRoute("/sign-in");
    }
  });

  createEffect(() => {
    if (
      sessionStatus() !== "ready" ||
      !sessionClaims() ||
      !sessionToken() ||
      !sessionTokenExpiresAt()
    ) {
      return;
    }

    const controller = new AbortController();
    void connectClientEventStream(currentAccessSession(), controller.signal);
    onCleanup(() => controller.abort());
  });

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

  return (
    <main class="h-screen overflow-hidden bg-[var(--color-bg)] text-[var(--color-text)]">
      <Show
        when={shouldShowAppShell()}
        fallback={
          <Show when={shouldShowAuthScreen()}>
            <AuthScreen
              mode={authMode()}
              email={authEmail()}
              password={authPassword()}
              status={sessionStatus()}
              error={authError()}
              onNavigate={navigate}
              onEmailChange={setAuthEmail}
              onPasswordChange={setAuthPassword}
              onSubmit={submitAuth}
            />
          </Show>
        }
      >
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
                  when={isSettingsRoute()}
                  fallback={
                    <Show
                      when={activeWorkspaceRoute()}
                      fallback={<PrimaryNav path={path()} onNavigate={navigate} />}
                    >
                      {(route) => (
                        <SessionNav route={route()} onNavigate={navigate} />
                      )}
                    </Show>
                  }
                >
                  <SettingsNav
                    path={path()}
                    backHref={lastAppPath()}
                    onNavigate={navigate}
                  />
                </Show>
              </ScrollFade>
            </nav>

            <UserMenu
              open={userMenuOpen()}
              displayName={resolvedDisplayName()}
              organizationName={resolvedOrganizationName()}
              activeOrganizationId={activeOrganizationId()}
              organizations={organizations()}
              onOpenChange={setUserMenuOpen}
              onNavigate={navigate}
              onOrganizationSwitch={(organizationId) =>
                void switchActiveOrganization(organizationId)
              }
            />
          </aside>

          <section class="min-h-0 overflow-y-auto py-8 pr-2">
            <Show when={activeRoute()}>
              {(route) => (
                <Show
                  when={route().href === "/chat"}
                  fallback={
                    <RoutePlaceholderPage route={route()}>
                      <Show
                        when={
                          route().href === "/settings/profile" ||
                          route().href === "/settings/appearance" ||
                          route().href === "/settings/personal"
                        }
                      >
                        <PersonalSettingsPage
                          pane={
                            route().href === "/settings/appearance"
                              ? "appearance"
                              : "profile"
                          }
                          email={sessionClaims()?.email ?? ""}
                          displayName={displayName()}
                          appearance={appearance()}
                          onDisplayNameChange={setDisplayName}
                          onAppearanceChange={setAppearance}
                        />
                      </Show>
                      <Show when={route().href === "/settings/organization"}>
                        <OrganizationSettingsPage
                          organizationName={organizationName()}
                          currentRole={membershipRole()}
                          organizationError={organizationError()}
                          members={organizationMembers()}
                          invites={organizationInvites()}
                          onOrganizationNameChange={setOrganizationName}
                          onDeleteOrganization={deleteActiveOrganization}
                          onInviteCreate={inviteOrganizationMember}
                          onMemberRoleChange={setOrganizationMemberRole}
                          onMemberRemove={removeMemberFromOrganization}
                        />
                      </Show>
                      <Show when={route().href === "/settings/inference"}>
                        <InferenceSettingsPage
                          currentRole={membershipRole()}
                          inferenceConfig={inferenceConfig()}
                          modelDefaults={modelDefaults()}
                          inferenceProviderError={inferenceProviderError()}
                          isAddingInferenceProvider={isAddingInferenceProvider()}
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
                    apiBaseUrl={apiBaseUrl()}
                    defaultModelSelection={modelDefaults().chat}
                    providers={enabledInferenceProviders()}
                    currentRole={membershipRole()}
                    ensureSession={ensureSession}
                    onNavigate={navigate}
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

            <Show when={isCreateOrganizationRoute()}>
              <CreateOrganizationPage
                error={organizationError()}
                onCreate={createNewOrganization}
              />
            </Show>

            <Show
              when={
                !activeRoute() &&
                !isConceptsIndex() &&
                !activeConcept() &&
                !isCreateOrganizationRoute()
              }
            >
              <NotFoundPage onNavigate={navigate} />
            </Show>
          </section>
        </div>
      </section>
      </Show>
    </main>
  );
}

function CreateOrganizationPage(props: {
  error: string;
  onCreate: (name: string) => Promise<unknown>;
}) {
  const [name, setName] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      await props.onCreate(name());
      setName("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div class="flex min-h-full items-center justify-center py-8">
      <form
        onSubmit={submit}
        class="grid w-full max-w-md gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5"
      >
        <div>
          <h1 class="text-base font-semibold text-[var(--color-text)]">
            New organization
          </h1>
          <p class="mt-1 text-sm leading-5 text-[var(--color-muted)]">
            Create an organization to continue.
          </p>
        </div>

        <label class="grid gap-2">
          <span class="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
            Organization name
          </span>
          <input
            type="text"
            value={name()}
            onInput={(event) => setName(event.currentTarget.value)}
            placeholder="Example, Inc."
            required
            class="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-muted)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand)]"
          />
        </label>

        <Show when={props.error}>
          <p class="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {props.error}
          </p>
        </Show>

        <button
          type="submit"
          disabled={submitting() || !name().trim()}
          class="rounded-md border border-[var(--color-brand)] bg-[var(--color-brand)] px-3 py-2 text-sm font-medium text-white transition hover:border-[var(--color-brand-strong)] hover:bg-[var(--color-brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting() ? "Creating..." : "Create organization"}
        </button>
      </form>
    </div>
  );
}

function AuthScreen(props: {
  mode: "login" | "register";
  email: string;
  password: string;
  status: SessionStatus;
  error: string;
  onNavigate: (href: string) => void;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onSubmit: (event: SubmitEvent) => void;
}) {
  return (
    <section class="flex h-screen items-center justify-center px-6">
      <form
        onSubmit={props.onSubmit}
        class="grid w-full max-w-sm gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5"
      >
        <div class="flex items-center gap-3">
          <img src={logoUrl} alt="Lush" class="h-9 w-9" />
          <div>
            <h1 class="text-base font-semibold text-[var(--color-text)]">
              Lush
            </h1>
            <p class="text-sm text-[var(--color-muted)]">
              {props.mode === "register" ? "Create account" : "Sign in"}
            </p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 rounded-md bg-[var(--color-panel)] p-1">
          <button
            type="button"
            onClick={() => props.onNavigate("/sign-in")}
            class={`rounded px-3 py-2 text-sm font-medium transition ${
              props.mode === "login"
                ? "bg-[var(--color-card)] text-[var(--color-text)]"
                : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => props.onNavigate("/register")}
            class={`rounded px-3 py-2 text-sm font-medium transition ${
              props.mode === "register"
                ? "bg-[var(--color-card)] text-[var(--color-text)]"
                : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            Register
          </button>
        </div>

        <label class="grid gap-2">
          <span class="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
            Email
          </span>
          <input
            type="email"
            value={props.email}
            onInput={(event) => props.onEmailChange(event.currentTarget.value)}
            class="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-muted)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand)]"
            required
          />
        </label>

        <label class="grid gap-2">
          <span class="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
            Password
          </span>
          <input
            type="password"
            value={props.password}
            onInput={(event) =>
              props.onPasswordChange(event.currentTarget.value)
            }
            class="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-muted)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand)]"
            minLength="8"
            required
          />
        </label>

        <Show when={props.error}>
          <p class="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {props.error}
          </p>
        </Show>

        <button
          type="submit"
          disabled={props.status === "loading"}
          class="rounded-md border border-[var(--color-brand)] bg-[var(--color-brand)] px-3 py-2 text-sm font-medium text-white transition hover:border-[var(--color-brand-strong)] hover:bg-[var(--color-brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {props.status === "loading"
            ? "Connecting..."
            : props.mode === "register"
              ? "Create account"
              : "Sign in"}
        </button>
      </form>
    </section>
  );
}

function isPublicAuthRoute(pathname: string) {
  return pathname === "/sign-in" || pathname === "/register";
}

type AuthRefreshClientEvent = {
  type: "auth.refresh_required";
  reason: string;
};

async function readClientEventStream(
  response: Response,
  signal: AbortSignal,
  onEvent: (event: AuthRefreshClientEvent) => Promise<void>
) {
  const reader = response.body?.getReader();
  if (!reader) {
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (!signal.aborted) {
      const result = await reader.read();
      if (result.done) {
        break;
      }

      buffer += decoder.decode(result.value, { stream: true });
      let separatorIndex = buffer.indexOf("\n\n");
      while (separatorIndex >= 0) {
        const frame = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const event = parseClientEventFrame(frame);
        if (event) {
          await onEvent(event);
        }
        separatorIndex = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseClientEventFrame(frame: string): AuthRefreshClientEvent | undefined {
  let eventName = "message";
  const data: string[] = [];

  for (const line of frame.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    const field = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
    const rawValue = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : "";
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;

    if (field === "event") {
      eventName = value;
    } else if (field === "data") {
      data.push(value);
    }
  }

  if (eventName !== "auth.refresh_required" || data.length === 0) {
    return undefined;
  }

  try {
    const event = JSON.parse(data.join("\n")) as Partial<AuthRefreshClientEvent>;
    return event.type === "auth.refresh_required" &&
      typeof event.reason === "string"
      ? {
          type: event.type,
          reason: event.reason
        }
      : undefined;
  } catch {
    return undefined;
  }
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
  });
}
