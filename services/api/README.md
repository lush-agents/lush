# API

Single front door for first-party clients and collaboration channels. It should
stay thin and route requests to the appropriate backend service.

## Development

```sh
bun run --cwd services/api dev
```

The service listens on `0.0.0.0:7330` by default so local clients can reach it
through either `http://localhost:7330` or `http://127.0.0.1:7330`.

## API Client Generation

The public API surface is aggregated in `src/spec.ts` from service-owned route
contracts, such as `@lush/inference/spec` and `@lush/agent/spec`. Generate the
shared TypeScript client package with:

```sh
bun run --cwd services/api codegen
```

Generated bindings are written to `packages/api-client/src/generated.ts` and
are consumed by the app through `@lush/api-client`.
