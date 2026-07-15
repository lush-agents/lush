import { sql } from "kysely";
import type { Migration } from "./types";

export const projects: Migration = {
  id: "004_projects",
  async up(db) {
    await sql`
      create table if not exists projects (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references organizations(id) on delete cascade,
        owner_user_id uuid not null references users(id) on delete cascade,
        name text not null,
        instructions text not null default '',
        memory text not null default '',
        pinned_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `.execute(db);

    await sql`
      create table if not exists project_context_items (
        id uuid primary key default gen_random_uuid(),
        project_id uuid not null references projects(id) on delete cascade,
        organization_id uuid not null references organizations(id) on delete cascade,
        owner_user_id uuid not null references users(id) on delete cascade,
        filename text not null,
        media_type text not null,
        content text not null,
        byte_size integer not null check (byte_size >= 0),
        created_at timestamptz not null default now()
      )
    `.execute(db);

    await sql`
      alter table session_threads
      add column if not exists project_id uuid references projects(id) on delete set null,
      add column if not exists pinned_at timestamptz
    `.execute(db);

    await sql`
      create index if not exists projects_owner_updated_idx
      on projects(organization_id, owner_user_id, updated_at desc)
    `.execute(db);

    await sql`
      create index if not exists project_context_items_project_created_idx
      on project_context_items(project_id, created_at asc, id asc)
    `.execute(db);

    await sql`
      create index if not exists session_threads_project_active_idx
      on session_threads(project_id, updated_at desc)
      where deleted = false and archived_at is null
    `.execute(db);

    await sql`
      create index if not exists session_threads_owner_pinned_idx
      on session_threads(organization_id, owner_user_id, pinned_at desc)
      where deleted = false and archived_at is null and pinned_at is not null
    `.execute(db);
  }
};
