import { useMemo, useState } from "react";
import { ArchiveIcon, SearchIcon } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../App";
import { Button } from "../components/ui/button";
import { SessionFilterMenu } from "../features/sessions/SessionFilterMenu";
import { SessionGlyph } from "../features/sessions/SessionGlyph";
import { SessionMenu } from "../features/sessions/SessionMenu";
import { useSessions } from "../features/sessions/useSessions";
import { createComposerFocusState } from "../lib/app-data";
import {
  defaultSessionFilters,
  filterSessions,
  formatSessionActivity,
  groupSessions,
  sessionExecutionStatusLabels,
  sessionTypeLabels
} from "../lib/session-organization";

export function SessionsPage() {
  const app = useApp();
  const navigate = useNavigate();
  const sessionActions = useSessions();
  const { sessions, archiveSession } = sessionActions;
  const [filters, setFilters] = useState(defaultSessionFilters);
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [archiveError, setArchiveError] = useState("");
  const [isArchiving, setIsArchiving] = useState(false);
  const visibleSessions = useMemo(
    () => filterSessions(sessions, filters, query),
    [filters, query, sessions]
  );
  const groups = useMemo(
    () => groupSessions(visibleSessions, filters.groupBy),
    [filters.groupBy, visibleSessions]
  );

  const startNewChat = () => {
    app.resetChatSession();
    navigate("/chat", { state: createComposerFocusState() });
  };

  const toggleSelection = (key: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const archiveSelected = async () => {
    const targets = sessions.filter((session) => selected.has(session.key) && !session.archiveDisabled);
    setIsArchiving(true);
    setArchiveError("");
    const failures: string[] = [];
    for (const session of targets) {
      try {
        await archiveSession(session);
        setSelected((current) => {
          const next = new Set(current);
          next.delete(session.key);
          return next;
        });
      } catch {
        failures.push(session.title);
      }
    }
    if (failures.length) setArchiveError(`Could not archive: ${failures.join(", ")}`);
    else setSelecting(false);
    setIsArchiving(false);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-1 py-2 sm:px-4 sm:py-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)] sm:text-3xl">
          Sessions
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {selecting && selected.size > 0 ? (
            <Button variant="outline" onClick={() => void archiveSelected()} disabled={isArchiving}>
              <ArchiveIcon data-icon="inline-start" />
              {isArchiving ? "Archiving..." : `Archive ${selected.size}`}
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={() => {
              setSelecting((current) => !current);
              setSelected(new Set());
              setArchiveError("");
            }}
          >
            {selecting ? "Cancel" : "Select"}
          </Button>
          <SessionFilterMenu filters={filters} onChange={setFilters} trigger="button" />
          <Button onClick={startNewChat}>New</Button>
        </div>
      </header>

      <label className="mt-7 flex h-12 items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] px-4 shadow-sm focus-within:border-[var(--color-border-strong)] focus-within:ring-2 focus-within:ring-[var(--color-brand)]/20">
        <SearchIcon className="size-4 shrink-0 text-[var(--color-muted)]" />
        <span className="sr-only">Search sessions</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search sessions..."
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]"
        />
      </label>

      {archiveError ? <p className="mt-3 text-sm text-red-500">{archiveError}</p> : null}

      <div className="mt-6">
        {visibleSessions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] px-5 py-12 text-center">
            <p className="text-sm font-medium text-[var(--color-text)]">No matching sessions</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">Try widening the filters or start a new chat.</p>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.key} className="mb-7">
              {group.label ? (
                <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                  {group.label}
                </h2>
              ) : null}
              <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
                {group.sessions.map((session) => {
                  const checked = selected.has(session.key);
                  return (
                    <div key={session.key} className="group flex min-h-16 items-center gap-3 px-2 transition hover:bg-[var(--color-panel-hover)] sm:px-4">
                      {selecting ? (
                        <input
                          type="checkbox"
                          aria-label={`Select ${session.title}`}
                          checked={checked}
                          disabled={session.archiveDisabled}
                          onChange={() => toggleSelection(session.key)}
                          className="size-4 accent-[var(--color-brand)]"
                        />
                      ) : null}
                      <Link to={session.href} className="flex min-w-0 flex-1 items-center gap-3 py-4">
                        <SessionGlyph type={session.type} className="size-4 shrink-0 text-[var(--color-muted)]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[var(--color-subtle)] group-hover:text-[var(--color-text)]">
                            {session.title}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-[var(--color-muted)]">
                            {sessionTypeLabels[session.type]}
                            {session.executionStatus
                              ? ` · ${sessionExecutionStatusLabels[session.executionStatus]}`
                              : ""}
                            {session.metadata ? ` · ${session.metadata}` : ""}
                          </span>
                        </span>
                        <time dateTime={session.updatedAt} className="shrink-0 text-xs text-[var(--color-muted)] sm:text-sm">
                          {formatSessionActivity(session.updatedAt)}
                        </time>
                      </Link>
                      {!selecting ? (
                        <SessionMenu
                          session={session}
                          projects={app.projects}
                          triggerClassName="flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--color-muted)] opacity-0 transition hover:bg-[var(--color-panel)] hover:text-[var(--color-text)] focus:opacity-100 group-hover:opacity-100"
                          onRename={(title) => sessionActions.renameSession(session, title)}
                          onPinChange={(pinned) => sessionActions.setSessionPinned(session, pinned)}
                          onMoveToProject={(projectId) => sessionActions.moveSessionToProject(session, projectId)}
                          onArchive={() => sessionActions.archiveSession(session)}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
