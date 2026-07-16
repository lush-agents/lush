# Lush App

Shared Lush client for chat, code, work, agents, settings, and admin surfaces.
The intended stack is React, shadcn/ui, and Tailwind for the frontend, packaged for web,
desktop, iOS, and Android through Tauri native wrappers.

## Scripts

- `bun run app:dev` - start only the Vite development server from the repo root.
- `bun run dev` - start the local API gateway and app from the repo root.
- `bun run build` - type-check and build the web bundle.
- `bun run tauri:dev` - run the app inside the Tauri shell.
- `bun run tauri:build` - build native desktop bundles with Tauri using the
  repository's `.env.development` defaults.

The Tauri shell requires Rust 1.88 or newer.

## Client Architecture

- `src/app/router.tsx` owns the React Router data tree, route guards, nested
  layouts, and lazy route chunks.
- `src/app/AppShell.tsx` owns persistent desktop navigation and renders route
  content through `Outlet`.
- `src/App.tsx` owns authenticated client state and domain mutations behind the
  `AppProvider` and `useApp` API. It does not render routes or page UI.
- `src/routes/*` contains route-level product surfaces. Large settings and chat
  routes are loaded on demand.
- `src/components/ui/*` contains shadcn primitives; product-specific adapters
  and composed controls live outside that directory.
- `src/components/ai-elements/*` contains registry-owned AI Elements source for
  prompt input, attachments, responses, reasoning, tools, sources, and artifacts.
- `src/lib/*` contains framework-independent session, streaming, and routing
  helpers with focused Bun tests under `tests/app-*.test.ts`.

## API Base URL

Browser builds read `LUSH_API_URL` from the production container's generated
runtime config, then fall back to build-time `VITE_LUSH_API_BASE_URL`, then the
page origin. This lets one immutable web image call an environment-specific
public API URL. When neither URL is set, the production web image reverse
proxies same-origin API routes. This is deployment config, not user-editable
state.

Tauri builds still require `VITE_LUSH_API_BASE_URL`. Desktop builds resolve
`localhost` API URLs to `127.0.0.1` at runtime so the Tauri webview reaches the
IPv4 Bun dev server reliably.

Vite loads environment files from the repository root. Tauri's local release
bundle uses Vite's `development` mode so `.env.development` is included; an
exported `VITE_LUSH_API_BASE_URL` takes precedence for other packaged targets.
