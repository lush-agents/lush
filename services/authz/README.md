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

Email verification is always required before issuing or accepting app sessions.
Local development can simulate verification by updating the real database state:

```sh
bun run auth:verify-email -- user@example.com
```

External auth providers normalize into the `AuthAssertion` adapter shape in
`src/runtime.ts`, then reuse the same user, organization, membership, and
session model. OAuth/OIDC adapters pass `emailVerified: true` when the provider
explicitly verifies the email claim; known email-vendor assertions, such as
Google, are treated as verified after successful token exchange.
