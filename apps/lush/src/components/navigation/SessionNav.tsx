import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { SessionSummary } from "@lush/api-client";
import { ArchiveIcon } from "lucide-react";
import type { Route } from "../../lib/types";
import { ConfirmDialog } from "../../ui/ConfirmDialog";

export function SessionNav(props: {
  route: Route;
  sessions: SessionSummary[];
  activeSessionId?: string;
  onNewSession: () => void;
  getSessionHref: (sessionId: string) => string;
  onSessionArchive: (sessionId: string) => Promise<unknown> | unknown;
}) {
  const navigate = useNavigate();
  const sessionLabel = props.route.label.toLowerCase();
  const [sessionPendingArchive, setSessionPendingArchive] =
    useState<SessionSummary>();
  const [isArchivingSession, setIsArchivingSession] = useState(false);
  const [archiveError, setArchiveError] = useState("");

  const requestSessionArchive = (session: SessionSummary) => {
    setArchiveError("");
    setSessionPendingArchive(session);
  };

  const confirmSessionArchive = async () => {
    const session = sessionPendingArchive;
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
        data-navigation-action
        onClick={() => {
          props.onNewSession();
          navigate(props.route.href);
        }}
        className="mb-3 block w-full rounded-md border border-[var(--color-brand)] bg-[var(--color-brand)] px-3 py-1.5 text-left text-[0.625rem] font-medium text-white transition hover:border-[var(--color-brand-strong)] hover:bg-[var(--color-brand-strong)]"
      >
        New {sessionLabel} session
      </button>

      <div className="mb-2 px-3 text-[0.5625rem] font-medium uppercase tracking-wide text-[var(--color-muted)]">
        Previous sessions
      </div>

      {props.sessions.map((session) => (
        <div
          key={session.id}
          className={`group relative w-full min-w-0 max-w-full overflow-hidden rounded-md transition ${
            props.activeSessionId === session.id
              ? "bg-[var(--color-panel-hover)]"
              : "hover:bg-[var(--color-panel-hover)]"
          }`}
        >
          <Link
            to={props.getSessionHref(session.id)}
            className={`session-title-button block w-full min-w-0 max-w-full overflow-hidden px-3 py-1.5 text-left text-[0.625rem] font-medium transition ${
              props.activeSessionId === session.id
                ? "text-[var(--color-text)]"
                : "text-[var(--color-subtle)] hover:text-[var(--color-text)]"
            } ${session.title.length > 28 ? "session-title-button--long" : ""}`}
            title={session.title}
          >
            <span className="session-title-viewport">
              <span className="session-title-track">
                <span className="session-title-text">{session.title}</span>
                <span
                  aria-hidden="true"
                  className="session-title-text session-title-duplicate"
                >
                  {session.title}
                </span>
              </span>
            </span>
          </Link>
          <button
            type="button"
            aria-label={`Archive ${session.title}`}
            title="Archive session"
            onClick={() => requestSessionArchive(session)}
            className="pointer-events-none absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md bg-[var(--color-panel-hover)] text-[var(--color-muted)] opacity-0 shadow-[-8px_0_8px_var(--color-panel-hover)] transition hover:text-[var(--color-text)] focus:pointer-events-auto focus:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
          >
            <ArchiveIcon className="size-3.5" />
          </button>
        </div>
      ))}

      <ConfirmDialog
        open={Boolean(sessionPendingArchive)}
        title="Archive session?"
        body="Archived sessions follow your organization's retention policy."
        confirmLabel="Archive session"
        pendingConfirmLabel="Archiving..."
        pending={isArchivingSession}
        error={archiveError}
        onCancel={() => {
          setArchiveError("");
          setSessionPendingArchive(undefined);
        }}
        onConfirm={() => void confirmSessionArchive()}
      />
    </>
  );
}
