import { sql } from "kysely";
import type { Migration } from "./types";

export const authActionTokens: Migration = {
  id: "007_auth_action_tokens",
  async up(db) {
    await sql`
      create table if not exists auth_action_tokens (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references users(id) on delete cascade,
        purpose text not null check (purpose in ('verify_email', 'reset_password')),
        token_hash text not null unique,
        expires_at timestamptz not null,
        used_at timestamptz,
        created_at timestamptz not null default now()
      )
    `.execute(db);

    await sql`
      create index if not exists auth_action_tokens_user_purpose_idx
      on auth_action_tokens(user_id, purpose, created_at desc)
    `.execute(db);
  }
};
