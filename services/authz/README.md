# Authn/z

Identity, organization, role, and runtime access-control service. This service
owns authorization decisions that other services enforce.

The initial implementation provides database-backed email/password auth,
email verification state, global users, organization tenants, memberships,
opaque refresh sessions, and short-lived asymmetric JWT access tokens for API
and service authorization.

Browser clients receive the refresh token only as an HttpOnly cookie. Login and
explicit refresh routes mint a short-lived access JWT that the app caches in
browser `sessionStorage` for the current tab and sends as a bearer token on
protected API requests.

Email verification uses random, single-use, expiring tokens stored only as
SHA-256 hashes. Password-reset tokens use the same discipline, and a completed
reset revokes every active session for the user. Re-registering an unverified
email supersedes its pending password registration and invalidates its prior
verification token.

The HTTP verifier accepts only a token. Operators can explicitly override
verification from the CLI for development or installations without SMTP:

```sh
bun run auth:verify-email -- user@example.com
```

Outbound auth email is injected through the `EmailDelivery` interface in
`@lush/notifications/email`. The bundled implementations are SMTP and a
development-only structured-log delivery. The API refuses to start with
password signup enabled unless delivery and `LUSH_PUBLIC_APP_URL` are configured.

External auth providers normalize into the `AuthAssertion` adapter shape in
`src/runtime.ts`, then reuse the same user, organization, membership, and
session model. OAuth/OIDC adapters pass `emailVerified: true` when the provider
explicitly verifies the email claim; known email-vendor assertions, such as
Google, are treated as verified after successful token exchange.
