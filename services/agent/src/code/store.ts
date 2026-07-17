import {
  chmod,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import type { CodeMessage, CodeSession, HarnessEvent } from "@lush/code";

type EventLogMetadata = {
  version: 1;
  eventCount: number;
  byteLength: number;
  derivedAssistantTurns: string[];
};

type SessionHeader = Omit<CodeSession, "events"> & {
  eventLog: EventLogMetadata;
};

export class CodeSessionStore {
  constructor(private readonly root: string) {}

  async list() {
    await this.ensureRoot();
    const files = await readdir(this.root);
    const sessions = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map((file) => this.get(path.basename(file, ".json")))
    );
    return sessions.filter((session): session is CodeSession => Boolean(session));
  }

  async get(id: string) {
    const sessionPath = this.sessionPath(id);
    await this.ensureRoot();
    const stored = await this.readHeader(sessionPath);
    if (!stored) return undefined;
    if (!("eventLog" in stored)) return stored as CodeSession;
    const eventLog = validateEventLogMetadata(stored.eventLog);

    const { eventLog: _, ...header } = stored;
    const events = await this.readEvents(this.eventLogPath(id), eventLog);
    const messages = reconstructMessages(
      header.messages,
      events,
      new Set(eventLog.derivedAssistantTurns)
    );
    const boundExternalSessionId = header.binding?.externalSessionId;
    if (boundExternalSessionId) {
      for (const event of events) {
        if (event.externalSessionId === "pending") event.externalSessionId = boundExternalSessionId;
      }
    }
    return { ...header, messages, events };
  }

  async put(session: CodeSession) {
    const destination = this.sessionPath(session.id);
    await this.ensureRoot();
    const eventLog = this.eventLogPath(session.id);
    const stored = await this.readHeader(destination);
    const committed = stored && "eventLog" in stored
      ? validateEventLogMetadata(stored.eventLog)
      : { version: 1 as const, eventCount: 0, byteLength: 0, derivedAssistantTurns: [] };

    if (committed.eventCount > session.events.length) {
      throw new Error("Session event history regressed");
    }

    await this.trimEventLog(eventLog, committed.byteLength);
    const tail = session.events.slice(committed.eventCount);
    const appended = tail.length
      ? Buffer.from(`${tail.map((event) => JSON.stringify(event)).join("\n")}\n`)
      : Buffer.alloc(0);
    if (appended.length) await this.appendEvents(eventLog, appended);

    const { messages, derivedAssistantTurns } = messagesForHeader(session, stored, tail);
    const { events: _, ...sessionHeader } = session;
    const header: SessionHeader = {
      ...sessionHeader,
      messages,
      eventLog: {
        version: 1,
        eventCount: session.events.length,
        byteLength: committed.byteLength + appended.length,
        derivedAssistantTurns
      }
    };
    await this.writeHeader(destination, header);
  }

  private async ensureRoot() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await chmod(this.root, 0o700);
  }

  private sessionPath(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid session id");
    return path.join(this.root, `${id}.json`);
  }

  private eventLogPath(id: string) {
    return path.join(this.root, `${id}.events.jsonl`);
  }

  private async readHeader(file: string): Promise<SessionHeader | CodeSession | undefined> {
    try {
      return JSON.parse(await readFile(file, "utf8")) as SessionHeader | CodeSession;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  private async readEvents(file: string, metadata: EventLogMetadata) {
    if (!metadata.byteLength) {
      if (metadata.eventCount) throw new Error("Session event log is missing");
      return [];
    }

    let data: Buffer;
    try {
      data = await readFile(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error("Session event log is missing", { cause: error });
      }
      throw error;
    }
    if (data.length < metadata.byteLength) throw new Error("Session event log is truncated");

    const committed = data.subarray(0, metadata.byteLength);
    if (committed.at(-1) !== 0x0a) throw new Error("Session event log has an invalid boundary");
    const events = committed
      .toString("utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as HarnessEvent);
    if (events.length !== metadata.eventCount) throw new Error("Session event log count does not match");
    return events;
  }

  private async trimEventLog(file: string, byteLength: number) {
    try {
      const handle = await open(file, "r+");
      try {
        const current = await handle.stat();
        if (current.size < byteLength) throw new Error("Session event log is truncated");
        if (current.size > byteLength) {
          await handle.truncate(byteLength);
          await handle.sync();
        }
      } finally {
        await handle.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && byteLength === 0) return;
      throw error;
    }
  }

  private async appendEvents(file: string, data: Buffer) {
    const handle = await open(file, "a", 0o600);
    try {
      await handle.chmod(0o600);
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private async writeHeader(file: string, header: SessionHeader) {
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(header, null, 2)}\n`, { mode: 0o600 });
      const handle = await open(temporary, "r");
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, file);
      await this.syncRoot();
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private async syncRoot() {
    let handle;
    try {
      handle = await open(this.root, "r");
      await handle.sync();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EISDIR" && code !== "EINVAL") throw error;
    } finally {
      await handle?.close();
    }
  }
}

function messagesForHeader(
  session: CodeSession,
  stored: SessionHeader | CodeSession | undefined,
  tail: HarnessEvent[]
) {
  if (!stored || !("eventLog" in stored)) {
    const deltas = assistantDeltasByTurn(session.events);
    const derivedAssistantTurns: string[] = [];
    const messages = session.messages.map((message) => {
      if (message.role !== "assistant" || deltas.get(message.turnId) !== message.content) return message;
      derivedAssistantTurns.push(message.turnId);
      return { ...message, content: "" };
    });
    return { messages, derivedAssistantTurns };
  }

  const metadata = validateEventLogMetadata(stored.eventLog);
  const derivedAssistantTurns = new Set(metadata.derivedAssistantTurns);
  const inlineAssistantTurns = new Set(
    stored.messages
      .filter((message) => message.role === "assistant" && message.content)
      .map((message) => message.turnId)
  );
  const assistantContent = new Map(
    session.messages
      .filter((message) => message.role === "assistant")
      .map((message) => [message.turnId, message.content])
  );
  for (const [turnId, content] of assistantDeltasByTurn(tail)) {
    if (!inlineAssistantTurns.has(turnId) && assistantContent.get(turnId) === content) {
      derivedAssistantTurns.add(turnId);
    }
  }
  const messages = session.messages.map((message) => (
    message.role === "assistant" && derivedAssistantTurns.has(message.turnId)
      ? { ...message, content: "" }
      : message
  ));
  return { messages, derivedAssistantTurns: [...derivedAssistantTurns] };
}

function reconstructMessages(
  stored: CodeMessage[],
  events: HarnessEvent[],
  derivedAssistantTurns: Set<string>
) {
  const messages = stored.map((message) => (
    message.role === "assistant" && derivedAssistantTurns.has(message.turnId)
      ? { ...message, content: "" }
      : { ...message }
  ));
  const assistants = new Map(
    messages
      .filter((message) => message.role === "assistant")
      .map((message) => [message.turnId, message])
  );
  const reconstructed = new Set<string>();
  for (const turnId of derivedAssistantTurns) {
    const message = assistants.get(turnId);
    if (!message || message.content) throw new Error("Session assistant message metadata is invalid");
  }
  for (const event of events) {
    if (event.kind !== "message.delta" || !derivedAssistantTurns.has(event.turnId ?? "")) continue;
    const turnId = event.turnId ?? "";
    const message = assistants.get(turnId)!;
    message.content += event.data.delta;
    reconstructed.add(turnId);
  }
  for (const turnId of derivedAssistantTurns) {
    if (!reconstructed.has(turnId)) throw new Error("Session assistant event history is missing");
  }
  return messages;
}

function assistantDeltasByTurn(events: HarnessEvent[]) {
  const deltas = new Map<string, string>();
  for (const event of events) {
    if (event.kind !== "message.delta") continue;
    const turnId = event.turnId ?? "";
    deltas.set(turnId, `${deltas.get(turnId) ?? ""}${event.data.delta}`);
  }
  return deltas;
}

function isEventLogMetadata(value: unknown): value is EventLogMetadata {
  if (!value || typeof value !== "object") return false;
  const metadata = value as Partial<EventLogMetadata>;
  return metadata.version === 1
    && Number.isSafeInteger(metadata.eventCount)
    && Number.isSafeInteger(metadata.byteLength)
    && Array.isArray(metadata.derivedAssistantTurns)
    && metadata.derivedAssistantTurns.every((turnId) => typeof turnId === "string")
    && new Set(metadata.derivedAssistantTurns).size === metadata.derivedAssistantTurns.length
    && (metadata.eventCount ?? -1) >= 0
    && (metadata.byteLength ?? -1) >= 0;
}

function validateEventLogMetadata(value: unknown) {
  if (!isEventLogMetadata(value)) throw new Error("Invalid session event log metadata");
  return value;
}
