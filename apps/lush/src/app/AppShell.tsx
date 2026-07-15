import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { MenuIcon } from "lucide-react";
import { useApp } from "../App";
import logoUrl from "../assets/lush-logo.svg?url";
import {
  Dialog,
  DialogContent,
  DialogTitle
} from "../components/ui/dialog";
import { PrimaryNav } from "../components/navigation/PrimaryNav";
import { SessionNav } from "../components/navigation/SessionNav";
import { CodeSessionNav } from "../components/navigation/CodeSessionNav";
import { SettingsNav } from "../components/navigation/SettingsNav";
import { UserMenu } from "../components/navigation/UserMenu";
import {
  matchWorkspaceSessionPath,
  routes,
  sessionRouteHref
} from "../lib/app-data";
import { ScrollFade } from "../ui/ScrollFade";

export function AppShell() {
  const app = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const [lastAppPath, setLastAppPath] = useState("/concepts");
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const sessionMatch = matchWorkspaceSessionPath(path);
  const activeWorkspaceRoute =
    sessionMatch?.route ?? routes.find((route) => route.href === path);
  const activeWorkspaceSessions = activeWorkspaceRoute?.sessionAgentId
    ? app.chatSessions.filter(
        (session) => session.agentId === activeWorkspaceRoute.sessionAgentId
      )
    : [];
  const isSettingsRoute = path.startsWith("/settings/");

  useEffect(() => {
    if (
      path !== "/" &&
      !isSettingsRoute &&
      path !== "/organizations/new" &&
      path !== "/sign-out"
    ) {
      setLastAppPath(path);
    }
  }, [isSettingsRoute, path]);

  useEffect(() => {
    setMobileNavigationOpen(false);
  }, [path]);

  const switchOrganization = async (organizationId: string) => {
    await app.switchActiveOrganization(organizationId);
    setUserMenuOpen(false);
    setMobileNavigationOpen(false);
    navigate("/concepts", { replace: true });
  };

  const workspaceNavigation = () =>
    isSettingsRoute ? (
      <SettingsNav backHref={lastAppPath} />
    ) : activeWorkspaceRoute?.href === "/code" ? (
      <CodeSessionNav activeSessionId={sessionMatch?.sessionId} />
    ) : activeWorkspaceRoute ? (
      <SessionNav
        route={activeWorkspaceRoute}
        sessions={activeWorkspaceSessions}
        activeSessionId={app.activeChatSessionId}
        onNewSession={app.resetChatSession}
        getSessionHref={(sessionId) =>
          sessionRouteHref(activeWorkspaceRoute, sessionId)
        }
        onSessionArchive={app.archiveChatSession}
      />
    ) : (
      <PrimaryNav />
    );

  const accountMenu = () => (
    <UserMenu
      open={userMenuOpen}
      displayName={app.resolvedDisplayName}
      organizationName={app.resolvedOrganizationName}
      activeOrganizationId={app.activeOrganizationId}
      organizations={app.organizations}
      onOpenChange={setUserMenuOpen}
      onSignOut={() => void app.signOut()}
      onOrganizationSwitch={(organizationId) => {
        void switchOrganization(organizationId).catch(() => undefined);
      }}
    />
  );

  const brandLink = () => (
    <Link
      to="/concepts"
      className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--color-text)]"
    >
      <img src={logoUrl} alt="Lush" className="size-8 shrink-0" />
      <span>Lush</span>
      {activeWorkspaceRoute ? (
        <>
          <span className="h-4 w-px shrink-0 bg-[var(--color-border-strong)]" />
          <span className="truncate rounded-md bg-[var(--color-panel)] px-2 py-1 text-xs font-medium text-[var(--color-subtle)]">
            {activeWorkspaceRoute.label}
          </span>
        </>
      ) : null}
    </Link>
  );

  return (
    <section className="flex h-screen min-h-0 w-full flex-col px-4 sm:px-6">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileNavigationOpen(true)}
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-[var(--color-subtle)] transition hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)]"
          >
            <MenuIcon className="size-5" />
          </button>
          {brandLink()}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-6">
        <aside className="hidden min-h-0 min-w-0 max-w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border-r border-[var(--color-border)] pr-6 lg:grid">
          <div className="flex h-14 min-w-0 items-center border-b border-[var(--color-border)]">
            {brandLink()}
          </div>
          <nav className="min-h-0 min-w-0 max-w-full overflow-hidden pt-4">
            <ScrollFade
              className="h-full w-full min-w-0 max-w-full overflow-hidden"
              viewportClass="h-full w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto"
              contentClass="w-full min-w-0 max-w-full overflow-hidden space-y-1"
              top={false}
              bottom={false}
            >
              {workspaceNavigation()}
            </ScrollFade>
          </nav>

          {accountMenu()}
        </aside>

        <section className="min-h-0 min-w-0 overflow-y-auto py-3 sm:py-4 lg:pr-2">
          <Outlet />
        </section>
      </div>

      <Dialog open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
        <DialogContent
          aria-describedby={undefined}
          className="top-0 left-0 grid h-dvh w-[min(20rem,calc(100vw-2rem))] max-w-none -translate-x-0 -translate-y-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-0 rounded-none border-y-0 border-l-0 p-4 sm:max-w-xs lg:hidden"
        >
          <DialogTitle className="mb-5 flex items-center gap-2 pr-10">
            <img src={logoUrl} alt="" className="size-8" />
            {activeWorkspaceRoute?.label ?? "Lush"}
          </DialogTitle>
          <nav
            className="min-h-0 overflow-y-auto"
            onClickCapture={(event) => {
              const target = event.target as HTMLElement;
              if (target.closest("a") || target.closest("[data-navigation-action]")) {
                setMobileNavigationOpen(false);
              }
            }}
          >
            {workspaceNavigation()}
          </nav>
          {accountMenu()}
        </DialogContent>
      </Dialog>
    </section>
  );
}
