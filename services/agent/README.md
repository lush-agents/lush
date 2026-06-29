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

## Auth

Local development uses a minimal bearer-token session boundary:

- `POST /auth/dev-session` creates an in-memory development session.
- `GET /session` returns the active session profile.
- `POST /agents/lush/chat` requires `Authorization: Bearer <token>`.

This is intentionally small, but keeps provider credentials server-side and
starts the access-scoping shape needed for hosted API deployment.

## Inference Configuration

- `LUSH_INFERENCE_PROVIDER` - `fireworks` or `baseten`; defaults to `fireworks`.
- `LUSH_INFERENCE_ENDPOINT` - override the OpenAI-compatible chat completions URL.
- `LUSH_INFERENCE_MODEL` - model name passed to the provider; defaults to
  `glm-5.2`.
- `LUSH_INFERENCE_API_KEY` - provider API key. `FIREWORKS_API_KEY` and
  `BASETEN_API_KEY` are also checked.
- `LUSH_APP_ORIGIN` - CORS origin for the app; defaults to `*`.

If no API key is configured, the service streams a local development fallback
response so the frontend can be exercised without provider credentials.
