# Deployment artifacts

This repository owns portable Lush build artifacts and their runtime contract.
A managed-service repository may own cloud resources, environment-specific
configuration, secrets, rollout policy, and operational automation, but it
should deploy the same images documented here. Self-hosted deployments consume
those images directly.

The [self-hosting guide](../services/docs/content/docs/setup/self-hosting.mdx)
provides a runnable single-host Compose stack plus configuration, SMTP,
security, upgrade, backup, and future external-auth guidance. This document is
the lower-level image contract for deployment implementations.

## Images

### `lush-api`

`ghcr.io/lush-agents/lush-api:<version>` runs the public API on port `7330` as
an unprivileged user. It also contains the database migration command, keeping
schema changes and application code on the same release coordinate.

Run migrations as a release job before starting the new API version:

```sh
docker run --rm \
  --env DATABASE_URL \
  ghcr.io/lush-agents/lush-api:0.1.0 \
  bun run db:migrate
```

Then run the service with the environment described in `.env.template`. At a
minimum, production deployments need PostgreSQL, secret and JWT key material,
the public app URL and origin, email delivery configuration, and an explicit
HTTPS/trusted-proxy policy. `GET /health` is the process health endpoint.

Migrations are forward-only and should be safe to complete before the new
application rollout. A future migration that cannot preserve that ordering
must ship as an explicit expand/migrate/contract sequence across releases.

### `lush-web`

`ghcr.io/lush-agents/lush-web:<version>` serves the browser app as an
unprivileged user on port `8080`. It includes a same-origin API proxy for local
and simple topologies. Production self-hosted deployments should terminate TLS
and route web/API traffic at their operator-managed ingress. The browser uses
the page origin by default, so the same immutable bundle works across
deployments without rebuilding environment-specific API URLs.

Runtime environment:

- `LUSH_API_URL` is the public API base URL used directly by the browser, for
  example `https://api.example.com`. It is written into a non-cacheable runtime
  config when the container starts, so changing environments does not rebuild
  the image. It defaults to empty.
- `LUSH_API_UPSTREAM` is the private API origin visible from the web container
  when `LUSH_API_URL` is empty and the browser uses the same-origin proxy. It
  defaults to `http://lush-api:7330`.
- `LUSH_EXTERNAL_SCHEME` is the scheme clients use at the outermost trusted
  ingress in same-origin proxy mode, either `http` or `https`; it defaults to
  `http`.

When `LUSH_API_URL` is set, configure the API's `LUSH_APP_ORIGIN` to allow the
web origin. When it is empty, the web image proxies `/v1beta/*` and `/health`,
preserves streaming responses, and serves its own liveness endpoint at
`GET /healthz`. Set `LUSH_EXTERNAL_SCHEME=https` when TLS terminates before the
web container, and configure `LUSH_TRUSTED_PROXIES` on the API to trust only the
web/ingress network that supplies forwarded headers.

For production same-origin ingress, route `/v1beta`, `/v1beta/*`, and `/health`
directly to the API; route all remaining paths to the web image. The ingress
owns TLS, forwarding-header normalization, streaming timeouts, response
buffering policy, public exposure, and any shared rate limits.

The Tauri app is intentionally different: it is not served from a browser
origin and still requires an explicit `VITE_LUSH_API_BASE_URL` at build time.

## Deployment order

For a single release:

1. Resolve both images to the same exact version or recorded digests.
2. Run the API image's migration command once with deployment-level locking.
3. Roll out the API image and wait for `/health`.
4. Roll out the web image and verify the ingress routes public `/healthz` and
   `/health` to the intended services.
5. Record the Git tag, image digests, and migration result in the deployment.

Do not run migrations implicitly in every API replica. A distinct migration
job makes failure, locking, and rollout ordering observable in both managed and
self-hosted environments.

## Local image builds

```sh
docker build -f containers/api/Dockerfile -t lush-api:local .
docker build -f containers/web/Dockerfile -t lush-web:local .
```

Pull requests build both images without publishing them. Release builds target
both `linux/amd64` and `linux/arm64` and publish to GHCR.
