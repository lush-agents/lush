# Agent

Service for agent harnesses and execution contexts. The first harness is
`lush`, a basic streaming chat agent with no tools.

For now, the harness uses the inference service runtime directly. The API
gateway remains the public entry point for first-party clients.

## Development

```sh
bun run agent:dev
```

The service listens on `http://127.0.0.1:7331`.

## Local Code sidecar

The desktop app launches a compiled sidecar from `src/code/sidecar.ts`. It owns
local Git worktrees, installed-harness discovery, process supervision, native
session bindings, normalized Code events, and the local session store. The
sidecar binds a random loopback port and requires a per-launch capability token
delivered over stdin by Tauri; it is not a public localhost API.

The dogfood adapters use one structured transport each:

- `codex exec --json`;
- `claude --print --output-format stream-json`; and
- `opencode run --format json`.

Run a credentialed two-turn behavioral canary in a temporary repository with:

```sh
bun run code:canary codex
bun run code:canary claude-code
bun run code:canary opencode openai/gpt-5.4-mini
```

Pull-request tests use sanitized fixtures and do not make inference calls.

## Auth

The standalone agent service verifies the same short-lived bearer access JWTs as
the API gateway:

- `GET /session` returns the active session profile.
- `POST /agents/:agentSlug/chat` requires `Authorization: Bearer <token>`.
- `POST /agents/:agentSlug/prompt` requires `Authorization: Bearer <token>`.

Sign in and refresh through the API auth routes, then pass the returned
`accessToken` to direct agent requests. Set `LUSH_AUTH_JWT_PUBLIC_KEY` so the
agent can verify tokens.

## Chat Context

`POST /agents/:agentSlug/chat` is session-backed. First-party clients send the
target `sessionId` plus `messages[]` containing only the newest client-side
message delta when possible. The agent service loads persisted session history
from `services/sessions`, verifies that the session belongs to the `lush` agent,
and appends only the non-overlapping client suffix before invoking inference.

The merge checks for a persisted-session suffix matching the client-message
prefix using per-message MD5 hashes over role and content, then confirms exact
role/content equality before deduplicating. The hash is only a cheap prefilter;
authorization and session ownership come from the sessions service and access
JWT.

`POST /agents/:agentSlug/prompt` is for explicit one-off prompt calls, such as
chat title generation. It does not load session history.

## Inference Configuration

- `LUSH_APP_ORIGIN` - CORS origin for the app; defaults to `*`.

Inference providers are organization-scoped database state managed through the
API/UI.
