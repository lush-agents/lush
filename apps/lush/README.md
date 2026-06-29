# Lush App

Shared Lush client for chat, code, work, agents, settings, and admin surfaces.
The intended stack is SolidJS and Tailwind for the frontend, packaged for web,
desktop, iOS, and Android through Tauri native wrappers.

## Scripts

- `bun run app:dev` - start only the Vite development server from the repo root.
- `bun run dev` - start the local API gateway and app from the repo root.
- `bun run build` - type-check and build the web bundle.
- `bun run tauri:dev` - run the app inside the Tauri shell.
- `bun run tauri:build` - build native desktop bundles with Tauri.

The Tauri shell requires Rust 1.88 or newer.

## API Base URL

The app reads its API gateway from `VITE_LUSH_API_BASE_URL`. This is runtime
deployment config, not user-editable state. Desktop builds resolve `localhost`
API URLs to `127.0.0.1` at runtime so the Tauri webview reaches the IPv4 Bun
dev server reliably.

For hosted builds, point `VITE_LUSH_API_BASE_URL` at the DNS/SSL-backed API
gateway, for example `https://api.lush.dev`.
