import type { Kysely, Transaction } from "kysely";
import { getDb } from "@lush/db/client";
import type {
  Database,
  SessionMessageRole,
  SessionMessageRow,
  SessionStateSnapshotRow,
  SessionThreadRow
} from "@lush/db/schema";

export type SessionPrincipal = {
  userId: string;
  organizationId: string;
};

export type SessionThreadSummary = {
  id: string;
  organizationId: string;
  ownerUserId: string;
  title: string;
  agentId: string;
  stateBytes: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type SessionMessage = {
  id: string;
  threadId: string;
  role: SessionMessageRole;
  content: string;
  metadata: unknown;
  tokenCount: number | null;
  byteSize: number;
  createdAt: string;
};

export type SessionStateSnapshot = {
  id: string;
  threadId: string;
  kind: string;
  state: unknown;
  byteSize: number;
  createdAt: string;
};

export type SessionThread = SessionThreadSummary & {
  messages: SessionMessage[];
  stateSnapshots: SessionStateSnapshot[];
};

export type CreateSessionThreadRequest = {
  title?: string;
  agentId: string;
};

export type UpdateSessionThreadRequest = {
  title?: string;
};

export type AppendSessionMessageRequest = {
  role: SessionMessageRole;
  content: string;
  metadata?: unknown;
  tokenCount?: number | null;
};

export type AppendSessionStateRequest = {
  kind: string;
  state: unknown;
};

export type SessionSettings = {
  organizationId: string;
  retentionSeconds: number;
  createdAt: string;
  updatedAt: string;
};

export type UpdateSessionSettingsRequest = {
  retentionSeconds: number;
};

export const sessionSizeLimits = {
  maxThreadBytes: 10 * 1024 * 1024,
  maxMessageContentBytes: 256 * 1024,
  maxStateSnapshotBytes: 1024 * 1024,
  maxMetadataBytes: 64 * 1024
} as const;

const messageRoles: SessionMessageRole[] = [
  "user",
  "assistant",
  "system",
  "tool"
];
const messageRoleSet = new Set<string>(messageRoles);
const textEncoder = new TextEncoder();

export class SessionStateError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

export async function listSessionThreads(principal: SessionPrincipal) {
  const db = getDb();
  const rows = await db
    .selectFrom("sessionThreads")
    .selectAll()
    .where("organizationId", "=", principal.organizationId)
    .where("ownerUserId", "=", principal.userId)
    .where("deleted", "=", false)
    .where("archivedAt", "is", null)
    .orderBy("updatedAt", "desc")
    .execute();

  return {
    sessions: rows.map(toThreadSummary)
  };
}

export async function createSessionThread(
  principal: SessionPrincipal,
  request: unknown
) {
  const body = normalizeCreateThreadRequest(request);
  const db = getDb();
  const now = new Date();
  const thread = await db
    .insertInto("sessionThreads")
    .values({
      organizationId: principal.organizationId,
      ownerUserId: principal.userId,
      title: body.title,
      agentId: body.agentId,
      stateBytes: 0,
      version: 1,
      deleted: false,
      deletedAt: null,
      deleteAfter: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  await recordSessionEvent(db, principal, {
    action: "session.thread_created",
    targetId: thread.id,
    metadata: {
      agentId: thread.agentId
    }
  });

  return toThreadSummary(thread);
}

export async function fetchSessionThread(
  principal: SessionPrincipal,
  threadId: string
) {
  const db = getDb();
  const thread = await loadOwnedThread(db, principal, threadId);
  if (!thread) {
    throw new SessionStateError(
      "session_thread_not_found",
      "Session thread was not found",
      404
    );
  }

  const [messages, snapshots] = await Promise.all([
    db
      .selectFrom("sessionMessages")
      .selectAll()
      .where("threadId", "=", thread.id)
      .orderBy("createdAt", "asc")
      .orderBy("id", "asc")
      .execute(),
    db
      .selectFrom("sessionStateSnapshots")
      .selectAll()
      .where("threadId", "=", thread.id)
      .orderBy("createdAt", "asc")
      .orderBy("id", "asc")
      .execute()
  ]);

  return {
    ...toThreadSummary(thread),
    messages: messages.map(toMessage),
    stateSnapshots: snapshots.map(toStateSnapshot)
  } satisfies SessionThread;
}

export async function updateSessionThread(
  principal: SessionPrincipal,
  threadId: string,
  request: unknown
) {
  const body = normalizeUpdateThreadRequest(request);
  const db = getDb();
  const now = new Date();
  const thread = await db.transaction().execute(async (trx) => {
    const current = await loadOwnedThreadForUpdate(trx, principal, threadId);
    if (!current) {
      throw new SessionStateError(
        "session_thread_not_found",
        "Session thread was not found",
        404
      );
    }
    assertThreadCanAcceptWrite(current);

    const updated = await trx
      .updateTable("sessionThreads")
      .set({
        ...body,
        updatedAt: now,
        version: current.version + 1
      })
      .where("id", "=", current.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    await recordSessionEvent(trx, principal, {
      action: "session.thread_updated",
      targetId: current.id,
      metadata: {
        fields: Object.keys(body)
      }
    });

    return updated;
  });

  return toThreadSummary(thread);
}

export async function appendSessionMessage(
  principal: SessionPrincipal,
  threadId: string,
  request: unknown
) {
  const body = normalizeAppendMessageRequest(request);
  const db = getDb();

  return db.transaction().execute(async (trx) => {
    const thread = await loadOwnedThreadForUpdate(trx, principal, threadId);
    if (!thread) {
      throw new SessionStateError(
        "session_thread_not_found",
        "Session thread was not found",
        404
      );
    }

    assertThreadCanAcceptWrite(thread);
    assertThreadLimit(thread.stateBytes, body.byteSize);
    const now = new Date();
    const message = await trx
      .insertInto("sessionMessages")
      .values({
        threadId: thread.id,
        organizationId: principal.organizationId,
        authorUserId: body.role === "user" ? principal.userId : null,
        role: body.role,
        content: body.content,
        metadata: body.metadata,
        tokenCount: body.tokenCount,
        byteSize: body.byteSize,
        createdAt: now
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await trx
      .updateTable("sessionThreads")
      .set({
        stateBytes: thread.stateBytes + body.byteSize,
        updatedAt: now,
        version: thread.version + 1
      })
      .where("id", "=", thread.id)
      .execute();

    await recordSessionEvent(trx, principal, {
      action: "session.message_created",
      targetId: thread.id,
      metadata: {
        messageId: message.id,
        role: message.role,
        byteSize: message.byteSize
      }
    });

    return toMessage(message);
  });
}

export async function appendSessionState(
  principal: SessionPrincipal,
  threadId: string,
  request: unknown
) {
  const body = normalizeAppendStateRequest(request);
  const db = getDb();

  return db.transaction().execute(async (trx) => {
    const thread = await loadOwnedThreadForUpdate(trx, principal, threadId);
    if (!thread) {
      throw new SessionStateError(
        "session_thread_not_found",
        "Session thread was not found",
        404
      );
    }

    assertThreadCanAcceptWrite(thread);
    assertThreadLimit(thread.stateBytes, body.byteSize);
    const now = new Date();
    const snapshot = await trx
      .insertInto("sessionStateSnapshots")
      .values({
        threadId: thread.id,
        organizationId: principal.organizationId,
        kind: body.kind,
        state: body.state,
        byteSize: body.byteSize,
        createdAt: now
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await trx
      .updateTable("sessionThreads")
      .set({
        stateBytes: thread.stateBytes + body.byteSize,
        updatedAt: now,
        version: thread.version + 1
      })
      .where("id", "=", thread.id)
      .execute();

    await recordSessionEvent(trx, principal, {
      action: "session.state_snapshot_created",
      targetId: thread.id,
      metadata: {
        snapshotId: snapshot.id,
        kind: snapshot.kind,
        byteSize: snapshot.byteSize
      }
    });

    return toStateSnapshot(snapshot);
  });
}

export async function archiveSessionThread(
  principal: SessionPrincipal,
  threadId: string
) {
  const db = getDb();
  const now = new Date();
  const thread = await db.transaction().execute(async (trx) => {
    const current = await loadOwnedThreadForUpdate(trx, principal, threadId);
    if (!current) {
      throw new SessionStateError(
        "session_thread_not_found",
        "Session thread was not found",
        404
      );
    }

    const settings = await getSessionSettingsForOrganization(
      trx,
      principal.organizationId
    );
    const deleteAfter = new Date(
      now.getTime() + settings.retentionSeconds * 1000
    );
    const updated = await trx
      .updateTable("sessionThreads")
      .set({
        archivedAt: current.archivedAt ?? now,
        deleted: true,
        deletedAt: current.deletedAt ?? now,
        deleteAfter,
        updatedAt: now,
        version: current.version + 1
      })
      .where("id", "=", current.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    await recordSessionEvent(trx, principal, {
      action: "session.thread_archived",
      targetId: current.id,
      metadata: {
        deleteAfter: deleteAfter.toISOString(),
        retentionSeconds: settings.retentionSeconds
      }
    });

    return updated;
  });

  await purgeDeletedSessionThreads();
  return toThreadSummary(thread);
}

export async function fetchSessionSettings(principal: SessionPrincipal) {
  return getSessionSettingsForOrganization(getDb(), principal.organizationId);
}

export async function updateSessionSettings(
  principal: SessionPrincipal,
  request: unknown
) {
  const body = normalizeUpdateSettingsRequest(request);
  const db = getDb();
  const now = new Date();
  const settings = await db
    .insertInto("organizationSessionSettings")
    .values({
      organizationId: principal.organizationId,
      retentionSeconds: body.retentionSeconds,
      createdAt: now,
      updatedAt: now
    })
    .onConflict((oc) =>
      oc.column("organizationId").doUpdateSet({
        retentionSeconds: body.retentionSeconds,
        updatedAt: now
      })
    )
    .returningAll()
    .executeTakeFirstOrThrow();

  await recordSessionEvent(db, principal, {
    action: "session.settings_updated",
    targetId: principal.organizationId,
    targetType: "organization",
    metadata: {
      retentionSeconds: settings.retentionSeconds
    }
  });

  return toSessionSettings(settings);
}

export async function purgeDeletedSessionThreads(now = new Date()) {
  const db = getDb();
  const rows = await db
    .selectFrom("sessionThreads")
    .select(["id", "organizationId", "ownerUserId"])
    .where("deleted", "=", true)
    .where("deleteAfter", "<=", now)
    .execute();

  if (rows.length === 0) {
    return { purged: 0 };
  }

  await db
    .deleteFrom("sessionThreads")
    .where(
      "id",
      "in",
      rows.map((row) => row.id)
    )
    .execute();

  for (const row of rows) {
    await recordSessionEvent(db, {
      organizationId: row.organizationId,
      userId: row.ownerUserId
    }, {
      action: "session.thread_purged",
      targetId: row.id,
      metadata: {}
    });
  }

  return { purged: rows.length };
}

export function messageByteSize(content: string, metadata: unknown = {}) {
  return byteLength(content) + jsonByteLength(metadata);
}

export function stateSnapshotByteSize(state: unknown) {
  return jsonByteLength(state);
}

export function jsonByteLength(value: unknown) {
  const serialized = JSON.stringify(value);
  return byteLength(serialized ?? "");
}

export function byteLength(value: string) {
  return textEncoder.encode(value).byteLength;
}

export function titleFromContent(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Untitled session";
  }

  return normalized.length > 80
    ? `${normalized.slice(0, 77).trimEnd()}...`
    : normalized;
}

function normalizeCreateThreadRequest(
  request: unknown
): {
  title: string;
  agentId: string;
} {
  const candidate = objectRequest(request);
  const agentId = normalizeShortText(candidate.agentId, "agent_id", 160);
  const title =
    typeof candidate.title === "string" && candidate.title.trim()
      ? normalizeTitle(candidate.title)
      : "Untitled session";

  return {
    title,
    agentId
  };
}

function normalizeUpdateThreadRequest(
  request: unknown
): UpdateSessionThreadRequest {
  const candidate = objectRequest(request);
  const update: UpdateSessionThreadRequest = {};

  if ("title" in candidate) {
    update.title = normalizeTitle(candidate.title);
  }

  if (Object.keys(update).length === 0) {
    throw new SessionStateError(
      "invalid_session_update",
      "At least one session field is required"
    );
  }

  return update;
}

function normalizeAppendMessageRequest(
  request: unknown
): AppendSessionMessageRequest & { byteSize: number; metadata: unknown } {
  const candidate = objectRequest(request);
  const role = normalizeMessageRole(candidate.role);
  const content = typeof candidate.content === "string" ? candidate.content : "";
  const metadata =
    "metadata" in candidate && candidate.metadata !== undefined
      ? candidate.metadata
      : {};
  const metadataBytes = jsonByteLength(metadata);
  const contentBytes = byteLength(content);
  const tokenCount =
    typeof candidate.tokenCount === "number" && Number.isFinite(candidate.tokenCount)
      ? Math.max(0, Math.floor(candidate.tokenCount))
      : null;

  if (!content.trim()) {
    throw new SessionStateError(
      "invalid_session_message",
      "Message content is required"
    );
  }

  if (contentBytes > sessionSizeLimits.maxMessageContentBytes) {
    throw new SessionStateError(
      "session_message_too_large",
      "Session message exceeds the maximum message size"
    );
  }

  if (metadataBytes > sessionSizeLimits.maxMetadataBytes) {
    throw new SessionStateError(
      "session_metadata_too_large",
      "Session metadata exceeds the maximum metadata size"
    );
  }

  return {
    role,
    content,
    metadata,
    tokenCount,
    byteSize: contentBytes + metadataBytes
  };
}

function normalizeAppendStateRequest(
  request: unknown
): AppendSessionStateRequest & { byteSize: number } {
  const candidate = objectRequest(request);
  const kind = normalizeShortText(candidate.kind, "state_kind", 120);
  const state = candidate.state;
  if (state === undefined) {
    throw new SessionStateError(
      "invalid_session_state",
      "Session state is required"
    );
  }
  const byteSize = stateSnapshotByteSize(state);

  if (byteSize > sessionSizeLimits.maxStateSnapshotBytes) {
    throw new SessionStateError(
      "session_state_too_large",
      "Session state exceeds the maximum state snapshot size"
    );
  }

  return {
    kind,
    state,
    byteSize
  };
}

function normalizeUpdateSettingsRequest(
  request: unknown
): UpdateSessionSettingsRequest {
  const candidate = objectRequest(request);
  const retentionSeconds = candidate.retentionSeconds;

  if (
    typeof retentionSeconds !== "number" ||
    !Number.isFinite(retentionSeconds) ||
    retentionSeconds < 0
  ) {
    throw new SessionStateError(
      "invalid_retention_seconds",
      "Retention seconds must be zero or greater"
    );
  }

  return {
    retentionSeconds: Math.floor(retentionSeconds)
  };
}

function normalizeMessageRole(value: unknown): SessionMessageRole {
  if (isSessionMessageRole(value)) {
    return value;
  }

  throw new SessionStateError(
    "invalid_session_message_role",
    "Session message role is invalid"
  );
}

function isSessionMessageRole(value: unknown): value is SessionMessageRole {
  return typeof value === "string" && messageRoleSet.has(value);
}

function normalizeTitle(value: unknown) {
  return normalizeShortText(value, "session_title", 160);
}

function normalizeShortText(value: unknown, code: string, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw new SessionStateError(`invalid_${code}`, "A non-empty value is required");
  }

  if (text.length > maxLength) {
    throw new SessionStateError(
      `invalid_${code}`,
      `Value must be ${maxLength} characters or fewer`
    );
  }

  return text;
}

function objectRequest(request: unknown) {
  if (!request || typeof request !== "object") {
    throw new SessionStateError("invalid_request", "Invalid session request");
  }

  return request as Record<string, unknown>;
}

function assertThreadLimit(currentBytes: number, addedBytes: number) {
  if (currentBytes + addedBytes > sessionSizeLimits.maxThreadBytes) {
    throw new SessionStateError(
      "session_thread_limit_exceeded",
      "Session thread exceeds the maximum stored state size"
    );
  }
}

function assertThreadCanAcceptWrite(thread: SessionThreadRow) {
  if (thread.deleted) {
    throw new SessionStateError(
      "session_thread_deleted",
      "Session thread has been deleted",
      409
    );
  }

  if (thread.archivedAt) {
    throw new SessionStateError(
      "session_thread_archived",
      "Session thread has been archived",
      409
    );
  }
}

async function loadOwnedThread(
  db: Kysely<Database> | Transaction<Database>,
  principal: SessionPrincipal,
  threadId: string
) {
  return db
    .selectFrom("sessionThreads")
    .selectAll()
    .where("id", "=", threadId)
    .where("organizationId", "=", principal.organizationId)
    .where("ownerUserId", "=", principal.userId)
    .where("deleted", "=", false)
    .where("archivedAt", "is", null)
    .executeTakeFirst();
}

async function loadOwnedThreadForUpdate(
  db: Transaction<Database>,
  principal: SessionPrincipal,
  threadId: string
) {
  return db
    .selectFrom("sessionThreads")
    .selectAll()
    .where("id", "=", threadId)
    .where("organizationId", "=", principal.organizationId)
    .where("ownerUserId", "=", principal.userId)
    .where("deleted", "=", false)
    .forUpdate()
    .executeTakeFirst();
}

async function getSessionSettingsForOrganization(
  db: Kysely<Database> | Transaction<Database>,
  organizationId: string
) {
  const existing = await db
    .selectFrom("organizationSessionSettings")
    .selectAll()
    .where("organizationId", "=", organizationId)
    .executeTakeFirst();

  if (existing) {
    return toSessionSettings(existing);
  }

  const now = new Date();
  const created = await db
    .insertInto("organizationSessionSettings")
    .values({
      organizationId,
      retentionSeconds: 0,
      createdAt: now,
      updatedAt: now
    })
    .onConflict((oc) => oc.column("organizationId").doNothing())
    .returningAll()
    .executeTakeFirst();

  if (created) {
    return toSessionSettings(created);
  }

  const raced = await db
    .selectFrom("organizationSessionSettings")
    .selectAll()
    .where("organizationId", "=", organizationId)
    .executeTakeFirstOrThrow();
  return toSessionSettings(raced);
}

async function recordSessionEvent(
  db: Kysely<Database> | Transaction<Database>,
  principal: SessionPrincipal,
  event: {
    action: string;
    targetId: string;
    targetType?: string;
    metadata: Record<string, unknown>;
  }
) {
  await db
    .insertInto("auditEvents")
    .values({
      organizationId: principal.organizationId,
      userId: principal.userId,
      sessionId: null,
      action: event.action,
      targetType: event.targetType ?? "session_thread",
      targetId: event.targetId,
      metadata: event.metadata,
      createdAt: new Date()
    })
    .execute();
}

function toThreadSummary(thread: SessionThreadRow): SessionThreadSummary {
  return {
    id: thread.id,
    organizationId: thread.organizationId,
    ownerUserId: thread.ownerUserId,
    title: thread.title,
    agentId: thread.agentId,
    stateBytes: thread.stateBytes,
    version: thread.version,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    archivedAt: thread.archivedAt?.toISOString() ?? null
  };
}

function toMessage(message: SessionMessageRow): SessionMessage {
  return {
    id: message.id,
    threadId: message.threadId,
    role: message.role,
    content: message.content,
    metadata: message.metadata,
    tokenCount: message.tokenCount,
    byteSize: message.byteSize,
    createdAt: message.createdAt.toISOString()
  };
}

function toStateSnapshot(snapshot: SessionStateSnapshotRow): SessionStateSnapshot {
  return {
    id: snapshot.id,
    threadId: snapshot.threadId,
    kind: snapshot.kind,
    state: snapshot.state,
    byteSize: snapshot.byteSize,
    createdAt: snapshot.createdAt.toISOString()
  };
}

function toSessionSettings(settings: {
  organizationId: string;
  retentionSeconds: number;
  createdAt: Date;
  updatedAt: Date;
}): SessionSettings {
  return {
    organizationId: settings.organizationId,
    retentionSeconds: settings.retentionSeconds,
    createdAt: settings.createdAt.toISOString(),
    updatedAt: settings.updatedAt.toISOString()
  };
}
