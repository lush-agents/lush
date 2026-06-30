import { createSignal, For } from "solid-js";
import type { SessionThreadSummary } from "@lush/api-client";
import type { Route } from "../../lib/types";
import { ConfirmDialog } from "../../ui/ConfirmDialog";

export function SessionNav(props: {
  route: Route;
  sessions: SessionThreadSummary[];
  activeSessionId?: string;
  onNavigate: (href: string) => void;
  onNewSession: () => void;
  getSessionHref: (threadId: string) => string;
  onSessionArchive: (threadId: string) => Promise<unknown> | unknown;
}) {
  const sessionLabel = props.route.label.toLowerCase();
  const [sessionPendingArchive, setSessionPendingArchive] =
    createSignal<SessionThreadSummary>();
  const [isArchivingSession, setIsArchivingSession] = createSignal(false);
  const [archiveError, setArchiveError] = createSignal("");

  const requestSessionArchive = (session: SessionThreadSummary) => {
    setArchiveError("");
    setSessionPendingArchive(session);
  };

  const confirmSessionArchive = async () => {
    const session = sessionPendingArchive();
    if (!session) {
      return;
    }

    setIsArchivingSession(true);
    setArchiveError("");

    try {
      await props.onSessionArchive(session.id);
      setSessionPendingArchive(undefined);
    } catch (error) {
      setArchiveError(
        error instanceof Error ? error.message : "Unable to archive session"
      );
    } finally {
      setIsArchivingSession(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          props.onNewSession();
          props.onNavigate(props.route.href);
        }}
        class="mb-3 block w-full rounded-md border border-[var(--color-brand)] bg-[var(--color-brand)] px-3 py-1.5 text-left text-[0.625rem] font-medium text-white transition hover:border-[var(--color-brand-strong)] hover:bg-[var(--color-brand-strong)]"
      >
        New {sessionLabel} session
      </button>

      <div class="mb-2 px-3 text-[0.5625rem] font-medium uppercase tracking-wide text-[var(--color-muted)]">
        Previous sessions
      </div>

      <For each={props.sessions}>
        {(session) => (
          <div
            class={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-md transition ${
              props.activeSessionId === session.id
                ? "bg-[var(--color-panel-hover)]"
                : "hover:bg-[var(--color-panel-hover)]"
            }`}
          >
            <button
              type="button"
              onClick={() => {
                props.onNavigate(props.getSessionHref(session.id));
              }}
              class={`session-title-button min-w-0 overflow-hidden px-3 py-1.5 text-left text-[0.625rem] font-medium transition ${
                props.activeSessionId === session.id
                  ? "text-[var(--color-text)]"
                  : "text-[var(--color-subtle)] hover:text-[var(--color-text)]"
              }`}
              classList={{
                "session-title-button--long": session.title.length > 28
              }}
              title={session.title}
            >
              <span class="session-title-viewport">
                <span class="session-title-track">
                  <span class="session-title-text">{session.title}</span>
                  <span aria-hidden="true" class="session-title-text session-title-duplicate">
                    {session.title}
                  </span>
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => requestSessionArchive(session)}
              class="mr-1 rounded px-1.5 py-1 text-[0.5625rem] font-medium text-[var(--color-muted)] opacity-0 transition hover:text-[var(--color-text)] group-hover:opacity-100 focus:opacity-100"
            >
              Archive
            </button>
          </div>
        )}
      </For>

      <ConfirmDialog
        open={Boolean(sessionPendingArchive())}
        title="Archive session?"
        body="Archived sessions follow your organization's retention policy."
        confirmLabel="Archive session"
        pendingConfirmLabel="Archiving..."
        pending={isArchivingSession()}
        error={archiveError()}
        onCancel={() => {
          setArchiveError("");
          setSessionPendingArchive(undefined);
        }}
        onConfirm={() => void confirmSessionArchive()}
      />
    </>
  );
}
