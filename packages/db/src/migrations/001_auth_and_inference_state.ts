import { sql } from "kysely";
import type { Migration } from "./types";

export const authAndInferenceState: Migration = {
  id: "001_auth_and_inference_state",
  async up(db) {
    await sql`create extension if not exists pgcrypto`.execute(db);

    await sql`
      create table if not exists users (
        id uuid primary key default gen_random_uuid(),
        email text not null unique,
        email_verified boolean not null default false,
        display_name text not null,
        avatar_url text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `.execute(db);

    await sql`
      create table if not exists organizations (
        id uuid primary key default gen_random_uuid(),
        name text not null,
        slug text not null unique,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `.execute(db);

    await sql`
      create table if not exists organization_memberships (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references organizations(id) on delete cascade,
        user_id uuid not null references users(id) on delete cascade,
        role text not null check (role in ('admin', 'user')),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (organization_id, user_id)
      )
    `.execute(db);

    await sql`
      create table if not exists organization_invites (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references organizations(id) on delete cascade,
        email text not null,
        role text not null check (role in ('admin', 'user')),
        status text not null check (status in ('pending', 'accepted', 'declined')),
        invited_by_user_id uuid references users(id) on delete set null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        expires_at timestamptz not null,
        responded_at timestamptz
      )
    `.execute(db);

    await sql`
      create table if not exists auth_providers (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid references organizations(id) on delete cascade,
        kind text not null check (kind in ('password', 'oidc', 'oauth', 'saml')),
        label text not null,
        enabled boolean not null default true,
        config jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `.execute(db);

    await sql`
      create table if not exists auth_identities (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references users(id) on delete cascade,
        provider_id uuid references auth_providers(id) on delete set null,
        provider_kind text not null check (provider_kind in ('password', 'oidc', 'oauth', 'saml')),
        subject text not null,
        email text,
        claims jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (provider_kind, provider_id, subject)
      )
    `.execute(db);

    await sql`
      create table if not exists password_credentials (
        user_id uuid primary key references users(id) on delete cascade,
        password_hash text not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `.execute(db);

    await sql`
      create table if not exists sessions (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references users(id) on delete cascade,
        organization_id uuid references organizations(id) on delete set null,
        membership_id uuid references organization_memberships(id) on delete set null,
        token_hash text not null unique,
        user_agent text,
        ip_hash text,
        created_at timestamptz not null default now(),
        last_used_at timestamptz not null default now(),
        expires_at timestamptz not null,
        revoked_at timestamptz
      )
    `.execute(db);

    await sql`
      create table if not exists audit_events (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid references organizations(id) on delete set null,
        user_id uuid references users(id) on delete set null,
        session_id uuid references sessions(id) on delete set null,
        action text not null,
        target_type text,
        target_id text,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      )
    `.execute(db);

    await sql`
      create table if not exists inference_providers (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references organizations(id) on delete cascade,
        kind text not null check (
          kind in ('baseten', 'fireworks', 'anthropic', 'openai', 'openai-compatible')
        ),
        label text not null,
        base_url text not null,
        encrypted_api_key text not null,
        enabled boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `.execute(db);

    await sql`
      create table if not exists inference_provider_models (
        id uuid primary key default gen_random_uuid(),
        provider_id uuid not null references inference_providers(id) on delete cascade,
        model_id text not null,
        label text not null,
        enabled boolean not null default false,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (provider_id, model_id)
      )
    `.execute(db);

    await sql`
      create table if not exists inference_model_defaults (
        organization_id uuid not null references organizations(id) on delete cascade,
        mode text not null check (mode in ('chat', 'code', 'work', 'agents')),
        model_selection text not null default '',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key (organization_id, mode)
      )
    `.execute(db);

    await sql`
      create index if not exists organization_memberships_user_id_idx
      on organization_memberships(user_id)
    `.execute(db);
    await sql`
      create index if not exists organization_invites_organization_id_created_at_idx
      on organization_invites(organization_id, created_at desc)
    `.execute(db);
    await sql`
      create index if not exists organization_invites_email_idx
      on organization_invites(email)
    `.execute(db);
    await sql`
      create unique index if not exists organization_invites_pending_email_idx
      on organization_invites(organization_id, email)
      where status = 'pending'
    `.execute(db);
    await sql`
      create index if not exists sessions_user_id_idx on sessions(user_id)
    `.execute(db);
    await sql`
      create index if not exists sessions_token_hash_idx on sessions(token_hash)
    `.execute(db);
    await sql`
      create index if not exists audit_events_organization_id_created_at_idx
      on audit_events(organization_id, created_at desc)
    `.execute(db);
    await sql`
      create index if not exists inference_providers_organization_id_idx
      on inference_providers(organization_id)
    `.execute(db);
    await sql`
      create index if not exists inference_provider_models_provider_id_idx
      on inference_provider_models(provider_id)
    `.execute(db);
  }
};
