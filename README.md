# lush

Open control plane for multi-model AI applications and agent runtimes.

This repository is scaffolded as a Bun workspace monorepo. The initial layout
separates client surfaces, backend services, and shared state/catalog packages
without committing to service implementations yet.

## Workspace Layout

- `apps/*` - end-user applications. `apps/lush` is the shared SolidJS app packaged for web, desktop, iOS, and Android through Tauri.
- `services/*` - deployable backend services and control-plane boundaries.
- `packages/*` - shared domain packages such as skills and memory.
