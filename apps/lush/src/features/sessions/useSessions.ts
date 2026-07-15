import { useApp } from "../../App";
import { useCode } from "../code/CodeProvider";
import {
  builtInAgentIds,
  routes,
  sessionRouteHref
} from "../../lib/app-data";
import type { SessionItem, SessionType } from "../../lib/session-organization";

export function useSessions() {
  const app = useApp();
  const code = useCode();

  const cloudSessions: SessionItem[] = app.sessions
    .filter((session) => session.agentId !== builtInAgentIds.code)
    .map((session) => {
      const route = routes.find((candidate) => candidate.sessionAgentId === session.agentId) ?? routes[0];
      return {
        key: `cloud:${session.id}`,
        id: session.id,
        source: "cloud",
        title: session.title,
        type: cloudSessionType(session.agentId),
        projectId: session.projectId,
        pinnedAt: session.pinnedAt,
        updatedAt: session.updatedAt,
        href: sessionRouteHref(route, session.id)
      };
    });

  const localSessions: SessionItem[] = code.sessions.map((session) => ({
    key: `local:${session.id}`,
    id: session.id,
    source: "local",
    title: session.title,
    type: "code",
    executionStatus: session.status,
    updatedAt: session.updatedAt,
    href: `/code/sessions/${encodeURIComponent(session.id)}`,
    metadata: `${session.repositoryName} · ${session.harnessId}`,
    archiveDisabled: session.status === "running",
    organizationDisabled: true
  }));

  const sessions = [...cloudSessions, ...localSessions];

  return {
    sessions,
    archiveSession: (session: SessionItem) =>
      session.source === "local"
        ? code.archiveSession(session.id)
        : app.archiveChatSession(session.id),
    renameSession: (session: SessionItem, title: string) => {
      if (session.source === "local") {
        throw new Error("Local Code session rename is not supported yet");
      }
      return app.updateChatSession(session.id, { title });
    },
    setSessionPinned: (session: SessionItem, pinned: boolean) => {
      if (session.source === "local") {
        throw new Error("Local Code session pinning is not supported yet");
      }
      return app.updateChatSession(session.id, { pinned });
    },
    moveSessionToProject: (session: SessionItem, projectId: string | null) => {
      if (session.source === "local") {
        throw new Error("Local Code sessions cannot be moved to projects");
      }
      return app.updateChatSession(session.id, { projectId });
    }
  };
}

function cloudSessionType(agentId: string): SessionType {
  if (agentId === builtInAgentIds.work) return "work";
  if (agentId === builtInAgentIds.agents) return "agent";
  if (agentId === builtInAgentIds.code) return "code";
  return "chat";
}
