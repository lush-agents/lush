export type SessionType = "chat" | "code" | "work" | "agent";
export type SessionExecutionStatus = "idle" | "running" | "completed" | "failed" | "interrupted";
export type SessionActivityWindow = "all" | "today" | "7d" | "30d";
export type SessionGroupBy = "none" | "activity" | "type";

export type SessionItem = {
  key: string;
  id: string;
  source: "cloud" | "local";
  title: string;
  type: SessionType;
  projectId?: string | null;
  pinnedAt?: string | null;
  executionStatus?: SessionExecutionStatus;
  updatedAt: string;
  href: string;
  metadata?: string;
  archiveDisabled?: boolean;
  organizationDisabled?: boolean;
};

export type SessionFilters = {
  type: "all" | SessionType;
  activity: SessionActivityWindow;
  groupBy: SessionGroupBy;
};

export const defaultSessionFilters: SessionFilters = {
  type: "all",
  activity: "all",
  groupBy: "none"
};

export function sessionFilterTypeForPath(
  pathname: string
): SessionFilters["type"] {
  if (isWorkspacePath(pathname, "/chat")) return "chat";
  if (isWorkspacePath(pathname, "/code")) return "code";
  if (isWorkspacePath(pathname, "/work")) return "work";
  if (isWorkspacePath(pathname, "/agents")) return "agent";
  return "all";
}

export function defaultSessionFiltersForPath(pathname: string): SessionFilters {
  return {
    ...defaultSessionFilters,
    type: sessionFilterTypeForPath(pathname)
  };
}

export const sessionTypeLabels: Record<SessionType, string> = {
  chat: "Chat",
  code: "Code",
  work: "Work",
  agent: "Agent"
};

export const sessionExecutionStatusLabels: Record<SessionExecutionStatus, string> = {
  idle: "Ready",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  interrupted: "Interrupted"
};

export function filterSessions(
  sessions: SessionItem[],
  filters: SessionFilters,
  query = "",
  now = new Date()
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const cutoff = activityCutoff(filters.activity, now);

  return sessions
    .filter((session) => {
      if (filters.type !== "all" && session.type !== filters.type) return false;
      if (cutoff && new Date(session.updatedAt).getTime() < cutoff.getTime()) return false;
      if (!normalizedQuery) return true;

      return [
        session.title,
        session.metadata ?? "",
        sessionTypeLabels[session.type],
        session.executionStatus
          ? sessionExecutionStatusLabels[session.executionStatus]
          : ""
      ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    })
    .sort((left, right) => dateValue(right.updatedAt) - dateValue(left.updatedAt));
}

export function groupSessions(
  sessions: SessionItem[],
  groupBy: SessionGroupBy,
  now = new Date()
) {
  if (groupBy === "none") {
    return [{ key: "all", label: "", sessions }];
  }

  const groups = new Map<string, { key: string; label: string; sessions: SessionItem[] }>();
  for (const session of sessions) {
    const group = resolveGroup(session, groupBy, now);
    const existing = groups.get(group.key);
    if (existing) existing.sessions.push(session);
    else groups.set(group.key, { ...group, sessions: [session] });
  }
  return [...groups.values()];
}

export function formatSessionActivity(value: string, now = new Date()) {
  const date = new Date(value);
  const milliseconds = now.getTime() - date.getTime();
  if (!Number.isFinite(milliseconds)) return "";
  if (milliseconds < 60_000) return "Just now";
  if (milliseconds < 3_600_000) return `${Math.max(1, Math.floor(milliseconds / 60_000))}m`;
  if (isSameDay(date, now)) return `${Math.max(1, Math.floor(milliseconds / 3_600_000))}h`;

  const yesterday = startOfDay(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return "Yesterday";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" })
  }).format(date);
}

function activityCutoff(activity: SessionActivityWindow, now: Date) {
  if (activity === "all") return undefined;
  const cutoff = startOfDay(now);
  if (activity === "today") return cutoff;
  cutoff.setDate(cutoff.getDate() - (activity === "7d" ? 6 : 29));
  return cutoff;
}

function resolveGroup(session: SessionItem, groupBy: SessionGroupBy, now: Date) {
  if (groupBy === "type") {
    return { key: session.type, label: sessionTypeLabels[session.type] };
  }
  const date = new Date(session.updatedAt);
  if (isSameDay(date, now)) return { key: "today", label: "Today" };
  const yesterday = startOfDay(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return { key: "yesterday", label: "Yesterday" };
  const weekAgo = startOfDay(now);
  weekAgo.setDate(weekAgo.getDate() - 6);
  if (date >= weekAgo) return { key: "week", label: "Previous 7 days" };
  return { key: "older", label: "Older" };
}

function startOfDay(value: Date) {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function dateValue(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function isWorkspacePath(pathname: string, workspacePath: string) {
  return pathname === workspacePath || pathname.startsWith(`${workspacePath}/`);
}
