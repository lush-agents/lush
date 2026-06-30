import { sql } from "kysely";
import type { Migration } from "./types";

export const sessionAgentId: Migration = {
  id: "003_session_agent_id",
  async up(db) {
    await sql`
      alter table session_threads
      add column if not exists agent_id text
    `.execute(db);

    await sql`
      do $$
      begin
        if exists (
          select 1
          from information_schema.columns
          where table_schema = current_schema()
            and table_name = 'session_threads'
            and column_name = 'mode'
        ) then
          execute $update$
            update session_threads
            set agent_id = case
              when agent_id is not null and btrim(agent_id) <> '' then agent_id
              when coalesce(nullif(btrim(agent_slug), ''), '') <> ''
                then btrim(agent_slug) || '-' || coalesce(nullif(btrim(mode), ''), 'chat')
              when mode = 'code' then 'lush-code'
              when mode = 'work' then 'lush-work'
              when mode = 'agents' then 'lush-agents'
              else 'lush-chat'
            end
            where agent_id is null or btrim(agent_id) = ''
          $update$;
        else
          update session_threads
          set agent_id = 'lush-chat'
          where agent_id is null or btrim(agent_id) = '';
        end if;
      end $$;
    `.execute(db);

    await sql`
      alter table session_threads
      alter column agent_id set not null
    `.execute(db);

    await sql`
      drop index if exists session_threads_owner_active_idx
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
      alter table session_threads
      drop column if exists mode,
      drop column if exists agent_slug,
      drop column if exists model_selection
    `.execute(db);
  }
};
