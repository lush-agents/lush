import { sql } from "kysely";
import type { Migration } from "./types";

export const sessionIpRetention: Migration = {
  id: "008_session_ip_retention",
  async up(db) {
    // Legacy values are unkeyed SHA-256 digests and cannot be converted to
    // keyed pseudonyms. Purge them rather than preserving enumerable IP data.
    await sql`
      update sessions
      set
        ip_hash = null,
        last_seen_ip_hash = null
      where ip_hash is not null or last_seen_ip_hash is not null
    `.execute(db);

    await sql`
      update audit_events
      set metadata = metadata - 'ipHash'
      where
        action = 'auth.refresh_token_reused'
        and metadata ? 'ipHash'
    `.execute(db);

    await sql`
      alter table sessions
      rename column ip_hash to ip_value
    `.execute(db);
    await sql`
      alter table sessions
      rename column last_seen_ip_hash to last_seen_ip_value
    `.execute(db);
    await sql`
      alter table sessions
      add column ip_mode text
      check (ip_mode in ('off', 'hmac', 'plain'))
    `.execute(db);
    await sql`
      alter table sessions
      add column last_seen_ip_mode text
      check (last_seen_ip_mode in ('off', 'hmac', 'plain'))
    `.execute(db);
  }
};
