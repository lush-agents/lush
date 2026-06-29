# Auth and State

This document describes the auth, authorization, and durable state currently
implemented in this repository.

## State Store

Lush uses PostgreSQL for the implemented product state. The database package is
`packages/db`, with Kysely type definitions in `packages/db/src/schema.ts` and
the migration runner in `packages/db/src/migrate.ts`.

The initial deployment model is one shared PostgreSQL database with
service-owned tables. That keeps local development and managed deployment
simple while preserving ownership boundaries:

- `services/authz` owns users, auth identities, credentials, sessions,
  organizations, memberships, invites, and audit events.
- `services/inference` owns inference providers, discovered models, default
  model selections, and encrypted provider credentials.
- Future service state should follow the same pattern: service-owned tables in
  the shared database until independent scaling or isolation justifies separate
  database URLs.

`DATABASE_URL` is required. Service-specific overrides are supported by
`packages/db/src/client.ts` through variables such as `AUTHZ_DATABASE_URL` and
`INFERENCE_DATABASE_URL`; if an override is not set, the service uses
`DATABASE_URL`. There is no implicit local database fallback in runtime code.

Required runtime environment variables are validated through `@lush/config`.
The API service validates its startup contract before binding the server and
reports all missing required values in one error.

Local development starts a Docker PostgreSQL container named `lush-postgres`
through the dev process manager. The database persists in the Docker volume
defined by `docker-compose.yml`.

## Authentication

Email/password auth is implemented now. Registration creates:

- a `users` row,
- a `password_credentials` row,
- a password `auth_identities` row,
- an initial `organizations` row,
- an `organization_memberships` row with role `admin`.

Registered email/password accounts must verify their email address before
sign-in. In local development, verification is simulated with:

```sh
bun run auth:verify-email -- user@example.com
```

Email verification is required because the email address is the stable human
principal used for login, invites, and future provider linking. OAuth/OIDC
providers that return a trusted verified email can satisfy this requirement on
successful token exchange.

The auth provider shape is intentionally pluggable. `AuthProviderAdapter`
normalizes provider-specific login completion into an internal `AuthAssertion`.
Only password auth is wired today; OAuth/OIDC, SAML, SSO, and managed enterprise
policy should extend the adapter boundary rather than adding parallel user
models.

`LUSH_AUTH_PASSWORD_ENABLED=false` disables email/password registration and login.
Hosted deployments can use that once another auth provider is implemented.

## Session Model

The app uses a refresh-token plus access-token split.

Refresh sessions are stored in the `sessions` table. The raw refresh token is
stored only in an HttpOnly `lush_session` cookie; the database stores a SHA-256
hash. Refresh sessions expire after `LUSH_SESSION_TTL_MS`, defaulting to 30
days. `POST /v1beta/auth/logout-all` revokes every active session for the
current user.

Access tokens are RS256 JWTs signed by `services/authz` with
`LUSH_AUTH_JWT_PRIVATE_KEY` and verified with `LUSH_AUTH_JWT_PUBLIC_KEY`.
`LUSH_AUTH_JWT_ISSUER` and `LUSH_AUTH_JWT_AUDIENCE` default to `lush-authz` and
`lush-api`. Access tokens expire after `LUSH_ACCESS_TOKEN_TTL_MS`, defaulting
to 5 minutes.

The browser caches the current access session in `sessionStorage` under
`lush:access-session`. The refresh cookie remains the source of truth. The app
uses `apps/lush/src/lib/api-session.ts` to parse claims, reject expired cached
tokens, refresh on 401 once, and apply refreshed sessions in one place.

Important JWT claims:

- `sub`: user id
- `sid`: session id
- `org`: active organization id, or `null`
- `mid`: active membership id, or `null`
- `role`: active organization role, or `null`
- `email`: user email
- `email_verified`: email verification status
- `name`: display name
- `org_name`: active organization name
- `jti`: access-token id

Creating, switching, or deleting an organization revokes the old refresh
session and mints a new refresh session plus access JWT. That keeps active
organization, membership, role, and organization name in the JWT claims.

Access-token validation checks both the JWT signature and the backing session
state. If a role, membership, user display name, or organization name changes,
the old JWT no longer matches the current session state and the client refreshes
before retrying. Removing a member revokes sessions tied to that membership.

The API also exposes an authenticated Server-Sent Events stream at
`GET /v1beta/auth/events`. This stream only sends invalidation hints; it never
sends tokens or sensitive state. The implemented event is:

```ts
type ClientEvent = {
  type: "auth.refresh_required";
  reason:
    | "claims_changed"
    | "membership_changed"
    | "organization_changed"
    | "session_revoked";
};
```

Clients treat every reason the same: mark the cached access token stale, call
the refresh endpoint, then reload session, organization, and inference state
through the normal idempotent path. Reasons are included for diagnostics and
logs, not for branching client behavior.

## Multi-Tenancy

Organizations are the tenant boundary. Users are global identities.
Memberships connect users to organizations and carry the active role.

Implemented behavior:

- Users can belong to multiple organizations.
- The user menu lists organizations and switches the active organization.
- Users can create organizations. The creator becomes an `admin`.
- Admins can delete the active organization.
- If deleting an organization leaves the user with another membership, the
  session switches to that organization.
- If deleting an organization leaves the user with no memberships, the app
  routes to `/organizations/new`.

Product state that belongs to a tenant should be scoped by `organization_id`.
Inference provider state already follows this rule.

## Roles and Authorization

Roles are hardcoded for now:

- `admin`: can manage organization settings, members, invites, inference
  providers, model defaults, and organization deletion.
- `user`: can use organization resources and view organization/inference
  settings, but cannot mutate organization or inference configuration.

The API gateway validates the access JWT, resolves a `Principal`, then checks
the requested action through `authorizePrincipal` in
`services/authz/src/runtime.ts`. Action names match protected API route ids.
The current ACL is explicit in `roleActionBindings`.

Server-side enforcement exists in two layers:

- API routes call `authorizePrincipal` before invoking service behavior.
- Authz runtime mutations such as member edits also assert admin access before
  writing state.

The app mirrors the same policy by rendering organization and inference
settings as read-only for non-admin members, but the backend checks are the
source of truth.

Each organization must retain at least one admin. Removing an admin or
downgrading an admin role locks the organization membership rows inside a
transaction and rejects the change if it would leave zero admins.

## Organization Invites

Admins can create and list organization invites. An invite stores:

- organization id,
- invited email,
- requested role,
- inviter user id,
- status: `pending`, `accepted`, or `declined`,
- expiration,
- timestamps.

Invite acceptance and invite emails are not implemented yet. Creating an invite
writes an `audit_events` row with action `auth.organization_invite_created` and
metadata containing `inviteId`, `email`, `role`, and `expiresAt`. That audit
event is the current integration point for a future email worker or managed
deployment event stream.

## Inference State

Inference providers are organization-scoped. Provider API keys are encrypted
before storage in `inference_providers.encrypted_api_key` using AES-GCM.
`LUSH_SECRET_KEY` is required to encrypt and decrypt provider credentials.
Local development generates it into the ignored `.env.development` file from
`.env.template`; hosted and self-hosted runtimes must set it explicitly.

Provider model discovery writes `inference_provider_models`. Model defaults are
stored in `inference_model_defaults` by organization and workspace mode.

The frontend does not attempt to fetch inference configuration until the access
JWT has active organization and role claims.

## API Surface

Implemented API routes are grouped under `/v1beta`. Auth and state routes
include:

- `POST /v1beta/auth/register`
- `POST /v1beta/auth/login`
- `POST /v1beta/auth/refresh`
- `POST /v1beta/auth/logout`
- `POST /v1beta/auth/logout-all`
- `GET /v1beta/session`
- `GET /v1beta/organizations`
- `POST /v1beta/organizations/switch`
- `POST /v1beta/organizations`
- `POST /v1beta/session/user`
- `POST /v1beta/session/organization`
- `POST /v1beta/session/organization/delete`
- `GET /v1beta/session/organization/members`
- `POST /v1beta/session/organization/members/role`
- `POST /v1beta/session/organization/members/remove`
- `POST /v1beta/session/organization/invites`
- `GET /v1beta/session/organization/invites`

Generated client code lives in `packages/api-client/src/generated.ts`.
Generated OpenAPI JSON is bundled into the docs service under
`services/docs/generated/openapi`.

## Local Development

`bun run dev` creates `.env.development` from `.env.template` if it does not
exist, generates a local-only JWT keypair and `LUSH_SECRET_KEY`, loads that env
file, starts `lush-postgres`, runs database migrations, and starts the local
service suite. Logs are written to `logs/` and mirrored to stdout by
`scripts/dev/process-manager.ts`.

The local app runs on port `5874`, which spells LUSH on a phone keypad. The API
runs on port `7330` by default.

Useful commands:

```sh
bun run dev
bun run db:migrate
bun run auth:verify-email -- user@example.com
bun run api:codegen
bun run api:openapi
bun test
bun run typecheck
```

## Current Limitations

- Only email/password auth is wired today.
- OAuth/OIDC, SAML, SCIM, managed SSO policy, and provider-specific account
  linking are adapter-level future work.
- Invite acceptance, invite decline, and invite email delivery are not
  implemented.
- Roles are hardcoded to `admin` and `user`; custom roles and resource-level
  ACLs are not implemented.
- Conversation/session workspace state is still mostly placeholder state.
