import { useNavigate } from "react-router-dom";
import type { SessionSummary } from "@lush/api-client";
import { createComposerFocusState } from "../../lib/app-data";
import type { Route } from "../../lib/types";
import { WorkspaceSessionNav } from "./WorkspaceSessionNav";

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

  return (
    <WorkspaceSessionNav
      newSessionLabel={`New ${sessionLabel} session`}
      sectionLabel="Previous sessions"
      activeSessionId={props.activeSessionId}
      items={props.sessions.map((session) => ({
        id: session.id,
        title: session.title,
        href: props.getSessionHref(session.id)
      }))}
      onNewSession={() => {
          props.onNewSession();
          navigate(props.route.href, { state: createComposerFocusState() });
      }}
      onArchive={props.onSessionArchive}
    />
  );
}
