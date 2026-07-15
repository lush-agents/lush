import { useNavigate } from "react-router-dom";
import { useCode } from "../../features/code/CodeProvider";
import { createComposerFocusState } from "../../lib/app-data";
import { WorkspaceSessionNav } from "./WorkspaceSessionNav";

export function CodeSessionNav({ activeSessionId }: { activeSessionId?: string }) {
  const code = useCode();
  const navigate = useNavigate();

  return (
    <WorkspaceSessionNav
      newSessionLabel="New code session"
      sectionLabel="Local sessions"
      activeSessionId={activeSessionId}
      items={code.sessions.map((session) => ({
        id: session.id,
        title: session.title,
        href: `/code/sessions/${session.id}`,
        metadata: `${session.repositoryName} · ${session.harnessId}`,
        archiveDisabled: session.status === "running"
      }))}
      onNewSession={() => {
          void code.selectSession();
          navigate("/code", { state: createComposerFocusState() });
      }}
      onArchive={(sessionId) => code.archiveSession(sessionId)}
    />
  );
}
