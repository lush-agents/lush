import { expect, test } from "bun:test";
import {
  defaultSessionFilters,
  defaultSessionFiltersForPath,
  filterSessions,
  formatSessionActivity,
  groupSessions,
  sessionFilterTypeForPath,
  type SessionItem
} from "../apps/lush/src/lib/session-organization";

const now = new Date("2026-07-14T17:00:00Z");
const sessions: SessionItem[] = [
  {
    key: "cloud:chat",
    id: "chat",
    source: "cloud",
    title: "Architecture review",
    type: "chat",
    updatedAt: "2026-07-14T16:00:00Z",
    href: "/chat/sessions/chat"
  },
  {
    key: "local:code",
    id: "code",
    source: "local",
    title: "Implement session filters",
    type: "code",
    executionStatus: "completed",
    updatedAt: "2026-07-13T12:00:00Z",
    href: "/code/sessions/code",
    metadata: "lush · codex"
  },
  {
    key: "cloud:work",
    id: "work",
    source: "cloud",
    title: "Older launch work",
    type: "work",
    updatedAt: "2026-06-01T12:00:00Z",
    href: "/work/sessions/work"
  }
];

test("session filters combine type, activity, and search", () => {
  expect(filterSessions(sessions, defaultSessionFilters, "", now).map((session) => session.id)).toEqual([
    "chat",
    "code",
    "work"
  ]);
  expect(filterSessions(sessions, { ...defaultSessionFilters, type: "code" }, "lush", now).map((session) => session.id)).toEqual([
    "code"
  ]);
  expect(filterSessions(sessions, { ...defaultSessionFilters, activity: "today" }, "", now).map((session) => session.id)).toEqual([
    "chat"
  ]);
  expect(filterSessions(sessions, defaultSessionFilters, "completed", now).map((session) => session.id)).toEqual([
    "code"
  ]);
});

test("sessions group in sorted activity order", () => {
  const visible = filterSessions(sessions, defaultSessionFilters, "", now);
  expect(groupSessions(visible, "activity", now).map((group) => group.label)).toEqual([
    "Today",
    "Yesterday",
    "Older"
  ]);
  expect(groupSessions(visible, "type", now).map((group) => group.label)).toEqual([
    "Chat",
    "Code",
    "Work"
  ]);
});

test("completed Code runs remain visible sessions", () => {
  const visible = filterSessions(sessions, defaultSessionFilters, "", now);
  expect(visible.find((session) => session.id === "code")).toMatchObject({
    executionStatus: "completed"
  });
});

test("session activity uses compact relative labels", () => {
  expect(formatSessionActivity("2026-07-14T16:00:00Z", now)).toBe("1h");
  expect(formatSessionActivity("2026-07-13T12:00:00Z", now)).toBe("Yesterday");
});

test("workspace routes derive their default recent-session type", () => {
  expect(sessionFilterTypeForPath("/chat")).toBe("chat");
  expect(sessionFilterTypeForPath("/chat/sessions/chat-1")).toBe("chat");
  expect(sessionFilterTypeForPath("/code/sessions/code-1")).toBe("code");
  expect(sessionFilterTypeForPath("/work")).toBe("work");
  expect(sessionFilterTypeForPath("/agents/sessions/agent-1")).toBe("agent");
  expect(sessionFilterTypeForPath("/sessions")).toBe("all");
  expect(sessionFilterTypeForPath("/artifacts")).toBe("all");
  expect(sessionFilterTypeForPath("/chatty")).toBe("all");

  expect(defaultSessionFiltersForPath("/code")).toEqual({
    ...defaultSessionFilters,
    type: "code"
  });
});
