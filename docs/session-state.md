# Session State

This document plans durable session state for conversations, threads, and
active work contexts. It is scoped to product state, not auth refresh sessions;
auth sessions remain owned by `services/authz`.

## Goals

- Persist chat/work sessions across app reloads, desktop/web clients, and
  future hosted deployments.
- Keep session state tenant-scoped by organization and user-accessible through
  the existing authz model.
- Keep initial visibility simple: users only see sessions they own.
- Default to PostgreSQL so local development and managed deployment use the
  same state path.
- Enforce explicit size limits so session state cannot be abused as blob
  storage.
- Store references to large files, generated assets, and binaries rather than
  embedding them in session records.
- Keep the service boundary clean enough that the sessions service can move to
  a separate database URL later if scaling requires it.

## Non-Goals

- Do not build the artifacts API in this phase.
- Do not store large binary payloads, screenshots, generated files, or code
  archives directly in session state.
- Do not introduce a separate database technology until Postgres is proven
  insufficient.
- Do not make the client the source of truth for session history or workspace
  state.
- Do not implement organization-wide session browsing or user-to-user session
  sharing in the first pass.

## Storage Choice

PostgreSQL should be the default session store.

Reasons:

- The repo already uses Postgres and Kysely for durable product state.
- Sessions need relational ownership, ACL checks, timestamps, pagination, and
  cleanup, all of which fit Postgres well.
- JSONB works for flexible per-agent state while normalized columns keep common
  queries fast.
- Managed deployment can use the same schema with a shared database first, then
  point `services/sessions` at a separate `SESSIONS_DATABASE_URL` later if it
  needs independent scaling.

The initial deployment model should match the rest of the repo: one shared
database with service-owned tables. The sessions service owns its tables and
uses `DATABASE_URL` by default.

## Data Model

Implemented service-owned tables:

- `sessions_threads`
- `sessions_messages`
- `sessions_state_snapshots`
- `sessions_attachments`

`sessions_threads` stores the durable session container:

- `id`
- `organization_id`
- `owner_user_id`
- `title`
- `agent_id`
- `state_bytes`
- `deleted`
- `deleted_at`
- `delete_after`
- `created_at`
- `updated_at`
- `archived_at`

`agent_id` identifies the agent that owns or interprets the session. It is the
durable discriminator for API consumers. First-party UI surfaces map built-in
agents, such as `lush-chat`, to navigation groups without leaking UI modes into
the sessions API.

The thread table is indexed for the common access patterns:

- active owner lists by `organization_id`, `owner_user_id`, `agent_id`, and
  descending `updated_at`
- direct agent/session lookup by `agent_id`, `id`

`sessions_messages` stores ordered conversation events:

- `id`
- `thread_id`
- `organization_id`
- `author_user_id`
- `role`: `user`, `assistant`, `system`, or `tool`
- `content`
- `metadata`
- `token_count`
- `byte_size`
- `created_at`

`sessions_state_snapshots` stores compact active work state:

- `id`
- `thread_id`
- `organization_id`
- `kind`
- `state`
- `byte_size`
- `created_at`

`sessions_attachments` stores references only:

- `id`
- `thread_id`
- `organization_id`
- `artifact_id`
- `label`
- `mime_type`
- `byte_size`
- `created_at`

Until the artifacts API exists, attachment rows should be reserved for future
references and not accept raw bytes.

Organization-level session settings should store:

- `organization_id`
- `retention_seconds`
- `created_at`
- `updated_at`

The initial default retention is `0` seconds.

## Size Limits

Session state must have hard server-side limits.

Initial limits:

- Maximum total stored bytes per thread: `10 MiB`.
- Maximum message content bytes: `256 KiB`.
- Maximum state snapshot bytes: `1 MiB`.
- Maximum metadata JSON bytes per row: `64 KiB`.

The `10 MiB` thread limit should include message content, message metadata,
state snapshots, and attachment reference metadata. It should not include
artifact bytes once the artifacts API exists.

Large binaries and generated files belong in the future artifacts service. A
session may store artifact references and small descriptive metadata, but never
the binary payload.

The service should reject writes that would exceed limits before committing the
transaction. Limit errors should be explicit, for example:

- `session_message_too_large`
- `session_state_too_large`
- `session_thread_limit_exceeded`
- `artifact_required`

## API Shape

Initial `/v1beta` routes should be narrow:

- `GET /v1beta/sessions`
- `POST /v1beta/sessions`
- `GET /v1beta/sessions/:threadId`
- `PATCH /v1beta/sessions/:threadId`
- `POST /v1beta/sessions/:threadId/messages`
- `POST /v1beta/sessions/:threadId/state`
- `POST /v1beta/sessions/:threadId/archive`
- `GET /v1beta/settings/sessions`
- `PATCH /v1beta/settings/sessions`

The API gateway should validate the access JWT, enforce authz, then pass a
principal with `organizationId`, `userId`, and `role` into the sessions service.

Session writes require an active organization. Orgless sessions should be
rejected with `organization_required`.

The chat UI should create a session on the first user message, not when opening
a blank chat view. Empty chats should remain client-only until there is content
worth persisting.

## Authorization

Initial policy can be simple:

- `admin` and `user` can create, read, update, and archive session threads in
  their active organization.
- Users can only see and mutate sessions where `owner_user_id` matches their
  user id.
- Only `admin` can update organization-level session settings.
- All session queries are scoped by both `organization_id` and `owner_user_id`.
- Cross-organization and cross-user access is impossible even if a thread id is
  guessed.

Future policy can add explicit sharing, project-level ACLs, organization-wide
admin views, and read-only roles. The first implementation should still route
every protected action through the same explicit authz action map used by the
rest of the API.

## Concurrency

Threads should support optimistic concurrency.

Use `updated_at` and optionally a monotonic `version` column on
`sessions_threads`. Mutating routes can accept `expectedVersion` once the UI
needs merge behavior. The first implementation can append messages
transactionally and recompute `state_bytes` under a row lock.

Message ordering should use `created_at` plus an ordered id. If strict ordering
becomes important for concurrent clients, add a per-thread sequence number.

## Deletion and Retention

Archiving a session should first soft-delete the thread by setting `deleted`,
`deleted_at`, and `delete_after`. Sweeps then physically delete rows once the
retention period has passed. Child rows should use cascading foreign keys so
messages, state snapshots, and attachment references are removed with the
thread during the sweep.

Retention is configured per organization. Initial retention should default to
`0` seconds. With that setting, an archived session is eligible for physical
deletion immediately because `delete_after` is already passed. The soft-delete
step still gives us one consistent code path for nonzero retention settings and
audit/event emission.

Archive is the only end-user session removal action. It hides the session from
the user. Physical deletion is an internal retention-policy outcome controlled
by organization settings, not a future user-facing affordance.

The sweeper can run:

- after a successful archive mutation,
- on service startup,
- later as a scheduled background task when `services/scheduler` exists.

Read paths must exclude `deleted` sessions by default.

## Snapshot Strategy

State snapshots should be append-only in the first implementation. Appending is
the most auditable model and matches conversation history: the system can
reconstruct how a work context evolved instead of only seeing the latest value.

The alternative would be retaining only the latest snapshot per `kind`, which
reduces storage and read complexity for pure preference/state-cache use cases.
That is less useful for session history, replay, debugging, and future
collaboration. Because session state already has a hard per-thread byte limit,
append-only snapshots are acceptable as the default.

If compaction becomes necessary, add it later as an explicit derived snapshot
or retention policy rather than mutating the source history in place.

## Events

Session writes should emit durable audit/event rows once the event stream
boundary exists. Useful events:

- `session.thread_created`
- `session.thread_updated`
- `session.message_created`
- `session.state_snapshot_created`
- `session.thread_archived`
- `session.thread_purged`

Client invalidation can initially be pull-based. Realtime sync can later use
the existing SSE pattern, but auth refresh events should remain separate from
session content events.

## Implementation Plan

1. Add `services/sessions` runtime package with Kysely-backed operations.
2. Add one migration file for session tables and indexes.
3. Add DB schema types for the new tables.
4. Add API route specs and generated client support under `/v1beta/sessions`.
5. Add authz action names for session routes.
6. Enforce `organization_id` scoping in every query and mutation.
7. Enforce `owner_user_id` scoping in every query and mutation.
8. Implement byte accounting helpers in the sessions service.
9. Reject writes that exceed row or thread limits inside the same transaction.
10. Add organization-level session settings with `retention_seconds`.
11. Implement archive-triggered soft-delete plus immediate purge when retention is `0`.
12. Wire the app to create a chat session on the first user message.
13. Expose archive in the UI, not delete.
14. Add focused tests for limits, org scoping, owner scoping, authz actions, and byte
    accounting.

## Testing

Required tests:

- byte accounting counts message content, metadata, and state snapshots,
- oversized messages are rejected,
- oversized snapshots are rejected,
- writes that would push a thread over `10 MiB` are rejected transactionally,
- session reads only return rows for the active organization,
- session reads only return rows owned by the current user,
- guessed cross-org thread ids return not found or unauthorized,
- guessed cross-user thread ids return not found or unauthorized,
- archived sessions disappear from read paths,
- retention `0` makes archived sessions eligible for immediate physical purge,
- only admins can update organization session settings,
- protected API routes have matching authz actions,
- generated API client includes the session route group.
