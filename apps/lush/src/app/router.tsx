import { lazy, Suspense, useEffect, useRef } from "react";
import {
  Navigate,
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useLocation,
  useNavigate,
  useParams,
  useRouteError
} from "react-router-dom";
import { AppProvider, useApp } from "../App";
import { TooltipProvider } from "../components/ui/tooltip";
import { routes } from "../lib/app-data";
import { AppShell } from "./AppShell";
import { AuthPage } from "../routes/AuthPage";
import { CreateOrganizationPage } from "../routes/CreateOrganizationPage";
import { NotFoundPage } from "../routes/NotFoundPage";
import { RoutePlaceholderPage } from "../routes/RoutePlaceholderPage";
import { ConceptDetailPage } from "../routes/concepts/ConceptDetailPage";
import { ConceptsPage } from "../routes/concepts/ConceptsPage";
import { PersonalSettingsPage } from "../routes/settings/PersonalSettingsPage";

const ChatPage = lazy(() =>
  import("../routes/chat/ChatPage").then((module) => ({ default: module.ChatPage }))
);
const InferenceSettingsPage = lazy(() =>
  import("../routes/settings/InferenceSettingsPage").then((module) => ({
    default: module.InferenceSettingsPage
  }))
);
const OrganizationSettingsPage = lazy(() =>
  import("../routes/settings/OrganizationSettingsPage").then((module) => ({
    default: module.OrganizationSettingsPage
  }))
);

const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    element: (
      <AppProvider>
        <TooltipProvider>
          <AppRoot />
        </TooltipProvider>
      </AppProvider>
    ),
    children: [
      { index: true, element: <IndexRoute /> },
      {
        element: <PublicOnlyRoute />,
        children: [
          { path: "sign-in", element: <AuthPage mode="login" /> },
          { path: "register", element: <AuthPage mode="register" /> }
        ]
      },
      {
        element: <AuthenticatedRoute />,
        children: [
          {
            element: <AppShell />,
            children: [
              {
                path: "organizations/new",
                element: <CreateOrganizationRoute />
              },
              { path: "sign-out", element: <SignOutRoute /> },
              {
                element: <OrganizationRoute />,
                children: [
                  { path: "concepts", element: <ConceptsRoute /> },
                  { path: "concepts/:slug", element: <ConceptDetailRoute /> },
                  { path: "settings/personal", element: <Navigate to="/settings/profile" replace /> },
                  { path: "settings/profile", element: <PersonalSettingsRoute pane="profile" /> },
                  { path: "settings/appearance", element: <PersonalSettingsRoute pane="appearance" /> },
                  { path: "settings/organization", element: <OrganizationSettingsRoute /> },
                  { path: "settings/inference", element: <InferenceSettingsRoute /> },
                  ...routes.flatMap((route) => [
                    {
                      path: route.href.slice(1),
                      element: route.href === "/chat" ? <ChatRoute /> : <RoutePlaceholderPage route={route} />
                    },
                    {
                      path: `${route.href.slice(1)}/sessions/:sessionId`,
                      element: route.href === "/chat" ? <ChatRoute /> : <RoutePlaceholderPage route={route} />
                    }
                  ]),
                  { path: "*", element: <NotFoundRoute /> }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}

function AppRoot() {
  return (
    <main className="h-screen overflow-hidden bg-[var(--color-bg)] text-[var(--color-text)]">
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </main>
  );
}

function IndexRoute() {
  const app = useApp();
  if (app.sessionStatus === "loading") return null;
  if (!app.isAuthenticated) return <Navigate to="/sign-in" replace />;
  return <Navigate to={app.hasActiveOrganization ? "/concepts" : "/organizations/new"} replace />;
}

function PublicOnlyRoute() {
  const app = useApp();
  if (app.sessionStatus === "loading") return null;
  if (app.isAuthenticated) {
    return <Navigate to={app.hasActiveOrganization ? "/concepts" : "/organizations/new"} replace />;
  }
  return <Outlet />;
}

function AuthenticatedRoute() {
  const app = useApp();
  const location = useLocation();
  if (app.sessionStatus === "loading") return null;
  if (!app.isAuthenticated) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

function OrganizationRoute() {
  const app = useApp();
  return app.hasActiveOrganization ? <Outlet /> : <Navigate to="/organizations/new" replace />;
}

function ConceptsRoute() {
  return <ConceptsPage />;
}

function ConceptDetailRoute() {
  const { slug } = useParams();
  return <ConceptDetailPage slug={slug ?? ""} />;
}

function CreateOrganizationRoute() {
  const app = useApp();
  return (
    <CreateOrganizationPage
      error={app.organizationError}
      onCreate={app.createNewOrganization}
    />
  );
}

function PersonalSettingsRoute({ pane }: { pane: "profile" | "appearance" }) {
  const app = useApp();
  return (
    <PersonalSettingsPage
      pane={pane}
      email={app.sessionClaims?.email ?? ""}
      displayName={app.displayName}
      appearance={app.appearance}
      onDisplayNameChange={app.setDisplayName}
      onAppearanceChange={app.setAppearance}
    />
  );
}

function OrganizationSettingsRoute() {
  const app = useApp();
  const navigate = useNavigate();

  const deleteOrganization = async () => {
    const result = await app.deleteActiveOrganization();
    navigate(result.requiresOrganization ? "/organizations/new" : "/concepts", {
      replace: true
    });
  };

  return (
    <OrganizationSettingsPage
      organizationName={app.organizationName}
      currentRole={app.membershipRole}
      organizationError={app.organizationError}
      members={app.organizationMembers}
      invites={app.organizationInvites}
      onOrganizationNameChange={app.setOrganizationName}
      onDeleteOrganization={deleteOrganization}
      onInviteCreate={app.inviteOrganizationMember}
      onMemberRoleChange={app.setOrganizationMemberRole}
      onMemberRemove={app.removeMemberFromOrganization}
    />
  );
}

function InferenceSettingsRoute() {
  const app = useApp();
  return (
    <InferenceSettingsPage
      currentRole={app.membershipRole}
      inferenceConfig={app.inferenceConfig}
      modelDefaults={app.modelDefaults}
      inferenceProviderError={app.inferenceProviderError}
      isAddingInferenceProvider={app.isAddingInferenceProvider}
      onAddInferenceProvider={app.addInferenceProvider}
      onProviderEnabledChange={app.setInferenceProviderEnabled}
      onProviderDelete={app.removeInferenceProvider}
      onModelEnabledChange={app.setInferenceModelEnabled}
      onModelDefaultChange={app.setModelDefault}
    />
  );
}

function ChatRoute() {
  const app = useApp();
  return (
    <ChatPage
      displayName={app.resolvedDisplayName}
      apiBaseUrl={app.apiBaseUrl}
      defaultModelSelection={app.modelDefaults.chat}
      providers={app.enabledInferenceProviders}
      currentRole={app.membershipRole}
      session={app.activeChatSession}
      sessionKey={app.chatSessionKey}
      ensureSession={app.ensureSession}
      onCreateSession={app.createChatSession}
      onAppendSessionMessage={app.appendChatSessionMessage}
      onSessionTitleChange={app.updateChatSessionTitle}
      onMessageFeedback={app.recordChatMessageFeedback}
    />
  );
}

function SignOutRoute() {
  const app = useApp();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void app.signOut();
  }, [app]);
  return null;
}

function NotFoundRoute() {
  return <NotFoundPage />;
}

function RouteErrorPage() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : "Unexpected client error";

  return (
    <main className="flex h-screen items-center justify-center bg-[var(--color-bg)] px-6 text-[var(--color-text)]">
      <section className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5">
        <h1 className="text-base font-semibold">Lush could not open this page</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">{message}</p>
        <a
          href="/"
          className="mt-4 inline-block text-sm font-medium text-[var(--color-brand-soft)] hover:text-[var(--color-text)]"
        >
          Return to Lush
        </a>
      </section>
    </main>
  );
}
