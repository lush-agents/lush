import { sql } from "kysely";
import type { Migration } from "./types";

export const sessionIpColumns: Migration = {
  id: "009_session_ip_columns",
  async up(db) {
    // The guards also repair databases that applied the interim version of
    // migration 008, which performed these renames before 009 existed.
    await sql`
      do $$
      begin
        if exists (
          select 1
          from information_schema.columns
          where table_schema = current_schema()
            and table_name = 'sessions'
            and column_name = 'ip_hash'
        ) and not exists (
          select 1
          from information_schema.columns
          where table_schema = current_schema()
            and table_name = 'sessions'
            and column_name = 'ip_value'
        ) then
          alter table sessions rename column ip_hash to ip_value;
        end if;

        if exists (
          select 1
          from information_schema.columns
          where table_schema = current_schema()
            and table_name = 'sessions'
            and column_name = 'last_seen_ip_hash'
        ) and not exists (
          select 1
          from information_schema.columns
          where table_schema = current_schema()
            and table_name = 'sessions'
            and column_name = 'last_seen_ip_value'
        ) then
          alter table sessions
          rename column last_seen_ip_hash to last_seen_ip_value;
        end if;
      end
      $$
    `.execute(db);

    await sql`
      alter table sessions
      add column if not exists ip_mode text
      check (ip_mode in ('off', 'hmac', 'plain'))
    `.execute(db);
    await sql`
      alter table sessions
      add column if not exists last_seen_ip_mode text
      check (last_seen_ip_mode in ('off', 'hmac', 'plain'))
    `.execute(db);
  }
};
