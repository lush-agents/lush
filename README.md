# lush

Open control plane for multi-model AI applications and agent runtimes.

This repository is scaffolded as a Bun workspace monorepo. The initial layout
separates client surfaces, backend services, and shared state/catalog packages
without committing to service implementations yet.

## Workspace Layout

- `apps/*` - end-user applications. `apps/lush` is the shared SolidJS app packaged for web, desktop, iOS, and Android through Tauri.
- `services/*` - deployable backend services and control-plane boundaries.
- `packages/*` - shared domain packages such as skills and memory.

## Development

```sh
bun run dev
```

The root dev command runs API client codegen, starts the local Hono API gateway,
starts the Lush app, prefixes logs by service, and shuts the group down if any
service exits.

Useful narrower commands:

- `bun run app:dev` - app only.
- `bun run api:dev` - local API gateway only.
- `bun run api:codegen` - regenerate `@lush/api-client`.

## Checks

```sh
bun test
```

The root test command runs repo-wide checks: API client codegen, `tsgo`
typechecking for the shared API client and app, and bundle checks for the API
and agent services.
