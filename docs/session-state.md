# Session State

This document describes the session state implementation in this repository.
Session state means durable product state for agent chats and active work
contexts. It is separate from authentication refresh sessions, which remain
owned by `services/authz`.

## Current Shape

Session state is implemented as a Postgres-backed service package:

- `services/sessions/src/spec.ts` defines the public route and type surface.
- `services/sessions/src/runtime.ts` implements the Kysely-backed operations.
- `services/api/src/server.ts` exposes those operations through the API gateway
  under `/v1beta`.
- `packages/db/src/migrations/002_session_state.ts` creates the session tables.
- `packages/db/src/migrations/003_session_agent_id.ts` ensures `agent_id` is
  the durable session grouping key.
- `packages/api-client/src/generated.ts` contains generated client helpers for
  the session routes.

The implementation uses the same shared Postgres database as the other
service-owned tables in this repo. The sessions service currently reads through
`@lush/db`, so it uses `DATABASE_URL` with the rest of the local and managed
service state.

## Ownership Model

Every session belongs to:

- one organization: `organization_id`
- one owner user: `owner_user_id`
- one caller-supplied agent identifier: `agent_id`

The current implementation exposes only owner-visible sessions. Users list,
read, update, append to, and archive their own sessions in their active
organization. Organization-wide browsing and user-to-user sharing are not
exposed.

`agent_id` is the API-level discriminator for the agent or product surface that
owns the session. The chat UI uses `lush-chat`. The sessions API does not encode
UI modes such as chat, code, or work.

## Data Model

The sessions migrations create these service-owned tables:

- `session_threads`
- `session_messages`
- `session_state_snapshots`
- `session_attachments`
- `organization_session_settings`

`session_threads` stores the durable session container:

- `id`
- `organization_id`
- `owner_user_id`
- `title`
- `agent_id`
- `state_bytes`
- `version`
- `deleted`
- `deleted_at`
- `delete_after`
- `created_at`
- `updated_at`
- `archived_at`

`session_messages` stores ordered message history:

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

`session_state_snapshots` stores versioned state snapshots. Normal writes append;
conversation truncation removes snapshots that reference deleted messages:

- `id`
- `thread_id`
- `organization_id`
- `kind`
- `state`
- `byte_size`
- `created_at`

`session_attachments` stores attachment references:

- `id`
- `thread_id`
- `organization_id`
- `artifact_id`
- `label`
- `mime_type`
- `byte_size`
- `created_at`

There is no public attachment API yet. Attachment rows are reserved for future
artifact references and do not store raw binary payloads.

`organization_session_settings` stores per-organization session settings:

- `organization_id`
- `retention_seconds`
- `created_at`
- `updated_at`

If a settings row does not exist, the runtime creates one with
`retention_seconds = 0`.

## Indexes

The session tables include indexes for the current read/write paths:

- active owner lists by `organization_id`, `owner_user_id`, `agent_id`, and
  descending `updated_at`
- direct agent/session lookup by `agent_id`, `id`
- retention purge lookup by `delete_after` for deleted sessions
- message ordering by `thread_id`, `created_at`, `id`
- state snapshot ordering by `thread_id`, `created_at`, `id`
- attachment ordering by `thread_id`, `created_at`, `id`

## API Surface

The session routes are published through the API gateway under `/v1beta`:

- `GET /v1beta/sessions`
- `POST /v1beta/sessions`
- `GET /v1beta/sessions/:sessionId`
- `PATCH /v1beta/sessions/:sessionId`
- `POST /v1beta/sessions/:sessionId/messages`
- `POST /v1beta/sessions/:sessionId/state`
- `POST /v1beta/sessions/:sessionId/truncate`
- `POST /v1beta/sessions/:sessionId/archive`
- `GET /v1beta/settings/sessions`
- `PATCH /v1beta/settings/sessions`

There is intentionally no public delete route. Archive is the user-visible
removal action, and physical deletion is controlled by the organization
retention policy.

The API gateway validates the access JWT, checks authorization for the route
action, and passes a `SessionPrincipal` with `userId` and `organizationId` into
the sessions runtime.

## Authorization

Session routes are part of the explicit authz action map in
`services/authz/src/runtime.ts`.

Current role behavior:

- `admin` and `user` can list, create, fetch, update, append to, and archive
  their own sessions.
- `admin` and `user` can fetch session settings.
- only `admin` can update organization session settings.
- every session query is scoped by active organization and owner user.

Guessed cross-organization and cross-user session ids do not load because the
runtime includes `organization_id` and `owner_user_id` predicates in read and
mutation queries.

## Size Limits

The runtime enforces hard byte limits before committing writes:

- maximum total stored bytes per session: `10 MiB`
- maximum message content bytes: `256 KiB`
- maximum state snapshot bytes: `1 MiB`
- maximum metadata JSON bytes per message: `64 KiB`

`state_bytes` tracks message content, message metadata, and state snapshots.
Large binaries and generated files are outside the session state contract and
belong in the future artifacts API. Sessions can reference artifacts once that
API exists, but do not embed artifact bytes.

Relevant runtime errors include:

- `session_message_too_large`
- `session_metadata_too_large`
- `session_state_too_large`
- `session_thread_limit_exceeded`

## Session Lifecycle

The chat UI creates a session on the first user message, not when opening a
blank chat route. Empty chat views remain client state until there is content
to persist.

Session writes happen transactionally. Mutating operations load the owned session
with `for update`, reject archived/deleted sessions, write the new row, update
`state_bytes`, bump `version`, and record an audit event.

`version` is present and increments on session mutations. The API does not yet
accept `expectedVersion`, so client-side optimistic merge behavior is deferred.

Message ordering is currently `created_at` plus `id`.

Retry and edit use an atomic truncation boundary. `afterMessageId` retains that
message and removes every later message; `null` removes all messages. The same
transaction removes state snapshots that reference deleted messages, decrements
`state_bytes`, bumps `version`, and records `session.thread_truncated`. Retry
then streams a replacement assistant response from the retained user message;
Edit truncates immediately before the edited user message when the replacement
is submitted.

## Archiving and Retention

Archive is the only end-user removal action.

Archiving a session:

1. Loads the owned session inside a transaction.
2. Reads or creates the organization session settings row.
3. Sets `archived_at`, `deleted`, `deleted_at`, and `delete_after`.
4. Records `session.thread_archived` in `audit_events`.
5. Runs the purge helper after the transaction.

`delete_after` is computed from the organization retention setting. The default
retention is `0` seconds, so archived sessions are immediately eligible for
physical purge.

Physical purge deletes matching `session_threads` rows. Child rows are removed
through cascading foreign keys. The purge helper records
`session.thread_purged` in `audit_events` for purged rows.

Read paths exclude archived/deleted sessions.

## Events

The sessions runtime records durable rows in `audit_events` for implemented
state changes:

- `session.thread_created`
- `session.thread_updated`
- `session.message_created`
- `session.state_snapshot_created`
- `session.thread_truncated`
- `session.thread_archived`
- `session.thread_purged`
- `session.settings_updated`

There is no dedicated realtime session event stream yet. Client invalidation is
currently request-driven.

## UI Integration

The Lush app uses the generated API client to persist chat sessions.

Implemented behavior:

- the chat route creates a `lush-chat` session on the first user message;
- existing sessions have stable routes containing the session id;
- the sidebar lists previous owner-visible sessions;
- long session titles scroll on hover in the sidebar;
- session titles are derived from the first user message and can be updated
  after the first assistant response;
- archive uses the shared confirmation dialog.

The chat streaming request is session-backed. The UI calls the agent API with
the target `sessionId`, selected model, and `messages[]` containing the newest
client-side message delta. The API loads persisted session history from
`services/sessions`, verifies the session's `agent_id` matches the `lush` chat
agent, and merges persisted history with the client messages before invoking
inference.

Agent responses use newline-delimited `AgentStreamEvent` objects rather than
unframed text chunks. The v1 event contract covers response lifecycle, text and
reasoning deltas, tool input/output, sources, artifacts, completion, and stream
errors. Providers that currently expose only text are adapted into
`response-start`, `text-delta`, and `response-complete` events at the agent
boundary.

Persisted message metadata uses the `lush.message.parts.v1` schema. Text remains
canonical in the message `content` column; metadata stores compact text lengths
plus structured non-text parts so ordering can be reconstructed without
duplicating long responses into the 64 KiB metadata budget.

The prompt input supports up to four inline text attachments with a 48 KiB
combined text budget. Their content is persisted as message metadata and added
to inference context. Binary and larger attachments remain owned by the future
artifacts API and are intentionally not embedded in session metadata.

The merge treats persisted history as canonical and appends only the
non-overlapping client suffix. It finds overlap by comparing the persisted
session suffix with the client message prefix using per-message MD5 hashes over
role and content, then confirms exact role/content equality before
deduplicating. The hash is only a prefilter; it is not used for authorization,
integrity, or trust.

One-off prompt calls, such as title generation, use the separate agent prompt
route and send their complete prompt explicitly. Prompt calls do not load
session history.

## Generated Docs

Session API docs are generated from the OpenAPI bundle:

- source route spec: `services/sessions/src/spec.ts`
- OpenAPI generator: `services/api/scripts/generate-openapi.ts`
- generated docs input: `services/docs/generated/openapi/sessions.json`
- docs page: `services/docs/content/docs/api/sessions.mdx`

## Tests

Current tests cover:

- byte accounting for UTF-8 strings and JSON metadata;
- session size-limit constants;
- title derivation from first-message content;
- the public route contract, including the absence of a delete route;
- migration registration and migration id ordering;
- the `agent_id`, `id` session lookup index;
- protected API route coverage in the authz action map;
- app route matching for session ids.

## Deferred Work

The implementation intentionally leaves these pieces for follow-up work:

- DB-backed runtime integration tests for owner/org scoping, archive retention,
  and purge behavior.
- A scheduled or startup purge runner. Purge currently runs after archive.
- Public APIs for attachment references once the artifacts API exists.
- Organization-wide browsing, user-to-user sharing, project-level ACLs, and
  read-only roles.
- `expectedVersion` support for optimistic concurrency and client-side merge
  handling.
- A dedicated realtime session event stream for sync/invalidation.
- State compaction or derived latest-state snapshots if accumulated snapshots
  become too expensive.
- Optional service-specific database configuration if sessions need independent
  scaling later.
