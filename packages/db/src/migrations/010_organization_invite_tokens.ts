import { sql } from "kysely";
import type { Migration } from "./types";

export const organizationInviteTokens: Migration = {
  id: "010_organization_invite_tokens",
  async up(db) {
    await sql`
      alter table organization_invites
      add column if not exists token_hash text
    `.execute(db);

    // Existing invites cannot be delivered retroactively. Give each one an
    // unrecoverable random hash so the column can be required without making
    // any pre-migration invite claimable by email alone.
    await sql`
      update organization_invites
      set token_hash = md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text)
      where token_hash is null
    `.execute(db);

    await sql`
      alter table organization_invites
      alter column token_hash set not null
    `.execute(db);

    await sql`
      create unique index if not exists organization_invites_token_hash_idx
      on organization_invites(token_hash)
    `.execute(db);
  }
};
