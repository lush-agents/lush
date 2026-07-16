import { sql } from "kysely";
import type { Migration } from "./types";

export const refreshTokenRotation: Migration = {
  id: "005_refresh_token_rotation",
  async up(db) {
    await sql`
      alter table sessions
      add column if not exists refresh_family_hash text
    `.execute(db);

    await sql`
      create unique index if not exists sessions_refresh_family_hash_idx
      on sessions(refresh_family_hash)
      where refresh_family_hash is not null
    `.execute(db);
  }
};
