import { sql } from "kysely";
import type { Migration } from "./types";

export const sessionState: Migration = {
  id: "002_session_state",
  async up(db) {
    await sql`
      create table if not exists session_threads (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references organizations(id) on delete cascade,
        owner_user_id uuid not null references users(id) on delete cascade,
        title text not null,
        agent_id text not null,
        state_bytes integer not null default 0 check (state_bytes >= 0),
        version integer not null default 1 check (version >= 1),
        deleted boolean not null default false,
        deleted_at timestamptz,
        delete_after timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        archived_at timestamptz
      )
    `.execute(db);

    await sql`
      create table if not exists session_messages (
        id uuid primary key default gen_random_uuid(),
        thread_id uuid not null references session_threads(id) on delete cascade,
        organization_id uuid not null references organizations(id) on delete cascade,
        author_user_id uuid references users(id) on delete set null,
        role text not null check (role in ('user', 'assistant', 'system', 'tool')),
        content text not null,
        metadata jsonb not null default '{}'::jsonb,
        token_count integer check (token_count is null or token_count >= 0),
        byte_size integer not null check (byte_size >= 0),
        created_at timestamptz not null default now()
      )
    `.execute(db);

    await sql`
      create table if not exists session_state_snapshots (
        id uuid primary key default gen_random_uuid(),
        thread_id uuid not null references session_threads(id) on delete cascade,
        organization_id uuid not null references organizations(id) on delete cascade,
        kind text not null,
        state jsonb not null,
        byte_size integer not null check (byte_size >= 0),
        created_at timestamptz not null default now()
      )
    `.execute(db);

    await sql`
      create table if not exists session_attachments (
        id uuid primary key default gen_random_uuid(),
        thread_id uuid not null references session_threads(id) on delete cascade,
        organization_id uuid not null references organizations(id) on delete cascade,
        artifact_id text not null,
        label text not null,
        mime_type text,
        byte_size integer not null check (byte_size >= 0),
        created_at timestamptz not null default now()
      )
    `.execute(db);

    await sql`
      create table if not exists organization_session_settings (
        organization_id uuid primary key references organizations(id) on delete cascade,
        retention_seconds integer not null default 0 check (retention_seconds >= 0),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `.execute(db);

    await sql`
      create index if not exists session_threads_owner_active_idx
      on session_threads(organization_id, owner_user_id, agent_id, updated_at desc)
      where deleted = false and archived_at is null
    `.execute(db);
    await sql`
      create index if not exists session_threads_agent_id_id_idx
      on session_threads(agent_id, id)
    `.execute(db);
    await sql`
      create index if not exists session_threads_delete_after_idx
      on session_threads(delete_after)
      where deleted = true
    `.execute(db);
    await sql`
      create index if not exists session_messages_thread_created_at_idx
      on session_messages(thread_id, created_at asc, id asc)
    `.execute(db);
    await sql`
      create index if not exists session_state_snapshots_thread_created_at_idx
      on session_state_snapshots(thread_id, created_at asc, id asc)
    `.execute(db);
    await sql`
      create index if not exists session_attachments_thread_created_at_idx
      on session_attachments(thread_id, created_at asc, id asc)
    `.execute(db);
  }
};
