import { afterEach, expect, test } from "bun:test";
import {
  appendFile,
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  truncate,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CodeSession, HarnessEvent } from "@lush/code";
import { CodeSessionStore } from "../services/agent/src/code/store";

const cleanup: string[] = [];
const sessionId = "11111111-1111-4111-8111-111111111111";

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

test("stores event tails once and reconstructs messages by turn", async () => {
  const directory = await stateDirectory();
  const store = new CodeSessionStore(directory);
  const session = fixture();

  await store.put({ ...session, messages: session.messages.slice(0, 2), events: session.events.slice(0, 1) });
  await store.put(session);

  const recovered = await new CodeSessionStore(directory).get(session.id);
  expect(recovered).toEqual(session);

  const header = JSON.parse(await readFile(path.join(directory, `${session.id}.json`), "utf8"));
  expect(header.events).toBeUndefined();
  expect(header.messages.map((message: { content: string }) => message.content)).toEqual([
    "first prompt",
    "",
    "second prompt",
    ""
  ]);
  expect(header.eventLog.eventCount).toBe(2);

  const logPath = path.join(directory, `${session.id}.events.jsonl`);
  const committedSize = (await stat(logPath)).size;
  await appendFile(logPath, `${JSON.stringify({ uncommitted: true })}\n`);
  expect(await new CodeSessionStore(directory).get(session.id)).toEqual(session);
  await store.put(session);
  expect((await stat(logPath)).size).toBe(committedSize);
});

test("preserves assistant content that is not represented by delta events", async () => {
  const directory = await stateDirectory();
  const session = fixture();
  session.messages.push({
    id: "assistant-final",
    role: "assistant",
    content: "final content without a delta",
    createdAt: "2026-07-17T00:00:03.000Z",
    turnId: "turn-3"
  });

  await new CodeSessionStore(directory).put(session);
  expect(await new CodeSessionStore(directory).get(session.id)).toEqual(session);
});

test("preserves final assistant content that differs from streamed deltas", async () => {
  const directory = await stateDirectory();
  const store = new CodeSessionStore(directory);
  const session = fixture();
  await store.put({ ...session, messages: session.messages.slice(0, 1), events: [] });

  const updated = {
    ...session,
    messages: session.messages.slice(0, 2).map((message) => (
      message.role === "assistant" ? { ...message, content: "final answer" } : message
    )),
    events: session.events.slice(0, 1)
  };
  await store.put(updated);
  expect(await new CodeSessionStore(directory).get(session.id)).toEqual(updated);
});

test("backfills pending event bindings after restart", async () => {
  const directory = await stateDirectory();
  const session = fixture();
  session.events[0].externalSessionId = "pending";

  await new CodeSessionStore(directory).put(session);
  const recovered = await new CodeSessionStore(directory).get(session.id);
  expect(recovered?.events[0].externalSessionId).toBe("external-session");
});

test("reads and migrates legacy session JSON", async () => {
  const directory = await stateDirectory();
  const session = fixture();
  const headerPath = path.join(directory, `${session.id}.json`);
  await writeFile(headerPath, JSON.stringify(session));

  const store = new CodeSessionStore(directory);
  expect(await store.get(session.id)).toEqual(session);
  expect(await store.list()).toEqual([session]);
  await store.put(session);
  expect(await new CodeSessionStore(directory).get(session.id)).toEqual(session);

  const header = JSON.parse(await readFile(headerPath, "utf8"));
  expect(header.events).toBeUndefined();
  expect(header.eventLog.eventCount).toBe(session.events.length);
});

test("does not treat an unreadable session header as missing", async () => {
  const directory = await stateDirectory();
  const session = fixture();
  const store = new CodeSessionStore(directory);
  const headerPath = path.join(directory, `${session.id}.json`);

  await store.put(session);
  await chmod(headerPath, 0o000);
  try {
    await expect(new CodeSessionStore(directory).get(session.id)).rejects.toThrow();
  } finally {
    await chmod(headerPath, 0o600);
  }
});

test("rejects corrupt headers and truncated committed logs", async () => {
  const directory = await stateDirectory();
  const store = new CodeSessionStore(directory);
  const session = fixture();
  const headerPath = path.join(directory, `${session.id}.json`);
  const logPath = path.join(directory, `${session.id}.events.jsonl`);

  await writeFile(headerPath, "{not-json");
  await expect(store.get(session.id)).rejects.toThrow();

  await rm(headerPath);
  await store.put(session);
  await truncate(logPath, Math.max(0, (await stat(logPath)).size - 1));
  await expect(new CodeSessionStore(directory).get(session.id)).rejects.toThrow("truncated");
});

test("keeps session artifacts private", async () => {
  const directory = await stateDirectory();
  const session = fixture();
  await chmod(directory, 0o777);
  await new CodeSessionStore(directory).put(session);

  const headerMode = (await stat(path.join(directory, `${session.id}.json`))).mode & 0o777;
  const logMode = (await stat(path.join(directory, `${session.id}.events.jsonl`))).mode & 0o777;
  const rootMode = (await stat(directory)).mode & 0o777;
  expect(rootMode).toBe(0o700);
  expect(headerMode).toBe(0o600);
  expect(logMode).toBe(0o600);
});

async function stateDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), "lush-code-store-"));
  cleanup.push(directory);
  return directory;
}

function fixture(): CodeSession {
  const turns = ["turn-1", "turn-2"];
  const events = turns.map((turnId, index) => ({
    id: `event-${index}`,
    sequence: index + 1,
    occurredAt: `2026-07-17T00:00:0${index}.000Z`,
    harnessId: "codex",
    externalSessionId: "external-session",
    turnId,
    kind: "message.delta",
    data: {
      messageId: "assistant",
      role: "assistant",
      format: "markdown",
      delta: index ? "second answer" : "first answer"
    }
  })) as HarnessEvent[];
  return {
    id: sessionId,
    title: "Persistence fixture",
    harnessId: "codex",
    status: "completed",
    branch: "main",
    repositoryName: "fixture",
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:02.000Z",
    archived: false,
    draft: {
      repositoryPath: "/tmp/fixture",
      baseRef: "main",
      harnessId: "codex",
      useWorktree: false,
      autonomy: "accept-edits"
    },
    effectiveAutonomy: "accept-edits",
    workspace: {
      repositoryRoot: "/tmp/fixture",
      path: "/tmp/fixture",
      branch: "main",
      baseRef: "main",
      baseCommit: "0123456789abcdef0123456789abcdef01234567",
      managedWorktree: false
    },
    binding: {
      harnessId: "codex",
      harnessVersion: "1.0.0",
      adapterVersion: "1.0.0",
      transport: "structured-cli",
      externalSessionId: "external-session"
    },
    messages: [
      { id: "user-1", role: "user", content: "first prompt", createdAt: "2026-07-17T00:00:00.000Z", turnId: turns[0] },
      { id: "assistant", role: "assistant", content: "first answer", createdAt: "2026-07-17T00:00:00.000Z", turnId: turns[0] },
      { id: "user-2", role: "user", content: "second prompt", createdAt: "2026-07-17T00:00:01.000Z", turnId: turns[1] },
      { id: "assistant", role: "assistant", content: "second answer", createdAt: "2026-07-17T00:00:01.000Z", turnId: turns[1] }
    ],
    events
  };
}
