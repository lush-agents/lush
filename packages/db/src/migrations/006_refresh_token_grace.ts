import { sql } from "kysely";
import type { Migration } from "./types";

export const refreshTokenGrace: Migration = {
  id: "006_refresh_token_grace",
  async up(db) {
    await sql`
      alter table sessions
      add column if not exists previous_token_hash text,
      add column if not exists rotated_at timestamptz,
      add column if not exists last_seen_user_agent text,
      add column if not exists last_seen_ip_hash text
    `.execute(db);

    await sql`
      update sessions
      set
        last_seen_user_agent = user_agent,
        last_seen_ip_hash = ip_hash
      where last_seen_user_agent is null and last_seen_ip_hash is null
    `.execute(db);
  }
};
