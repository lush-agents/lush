# Tools Plan

This document sketches the tool architecture Lush should grow into. The goal is
to make tools easy to add, centrally governed, observable, and safe to execute
on behalf of a user.

## Goals

- A good engineer plus a coding agent can add a well-documented tool in about
  five minutes.
- Lush is a fully functional MCP client.
- Tools are centrally managed through `services/tools`, not embedded directly
  inside agent harnesses.
- Public, reusable tool definitions can live in an OSS catalog.
- Organizations can enable public tools, add custom tools, and connect
  arbitrary MCP servers.
- Every tool call runs with the session-context principal of the user the agent
  is acting for.
- Every tool discovery and call emits OpenTelemetry spans and durable audit
  events.
- The model sees only the tools authorized for the current agent/session/user
  context.

## Current Repo Fit

`services/tools` already exists as the intended service boundary:

> Mediated access layer for MCP, OpenAPI, and other tool integrations. Models
> receive scoped capabilities rather than raw URLs or credentials.

That is the right boundary. The agent service should ask the tools service for
available tools and execute tool calls through it. The agent service should not
learn provider credentials, MCP server secrets, or per-organization tool policy.

The current inference stack is custom; the repo is not yet using the Vercel AI
SDK `ai` package or `@ai-sdk/mcp`. We should not let an external SDK become the
domain model. We can still use proven interfaces where they reduce work:

- MCP is the network/interoperability standard for external tool servers.
- Vercel AI SDK's tool shape is useful as an adapter target because it is close
  to the model-facing shape: description, input schema, optional execute
  function, approval policy, active tool selection, and MCP conversion.
- Lush should own a stable `ToolDefinition` / `ToolCall` / `ToolResult` domain
  model and provide adapters from that model to model-provider tool formats.

## Recommended Architecture

```text
agent runtime
  -> tools service: resolve authorized tool set for session principal
  -> inference provider: model sees selected tool schemas
  -> tools service: execute selected tool call
  -> tool adapter: native / OpenAPI / MCP / future adapters
  -> external system
```

`services/tools` becomes the central gateway. Its jobs:

1. Store catalog definitions and organization installations.
2. Discover tools from MCP servers and OpenAPI specs.
3. Normalize all tools into one Lush tool contract.
4. Filter tools by authorization, session context, agent, workspace, and
   policy.
5. Execute tool calls with the acting user principal.
6. Emit traces, metrics, audit events, and structured call logs.
7. Hide credentials and raw connector details from model-facing services.

## Core Domain Model

The central noun should be `Tool`.

Suggested types:

```ts
type ToolSourceKind = "native" | "mcp" | "openapi";

type ToolDefinition = {
  id: string;
  sourceKind: ToolSourceKind;
  sourceRef: string;
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  effects: ToolEffect[];
  approval: ToolApprovalPolicy;
  authzAction: string;
  timeoutMs: number;
  tags: string[];
  version: string;
};

type ToolEffect =
  | "read"
  | "write"
  | "send_message"
  | "external_side_effect"
  | "secret_access";

type ToolCallContext = {
  organizationId: string;
  userId: string;
  sessionId: string;
  agentId: string;
  membershipId: string | null;
  role: "admin" | "user";
  traceId: string;
};

type ToolCall = {
  toolId: string;
  input: unknown;
  context: ToolCallContext;
};

type ToolResult = {
  output: unknown;
  content?: ToolResultContent[];
  metadata: {
    durationMs: number;
    remoteRequestId?: string;
    cacheHit?: boolean;
  };
};
```

The model-facing tool name should be stable and collision-resistant. Use a
namespaced form internally, such as:

```text
catalog.github.create_issue
org.crm.lookup_account
mcp.linear.create_issue
```

The UI can display short titles, but the runtime should prefer stable IDs.

## Tool Catalogs

### Public Catalog

The public catalog should be OSS and reviewable. It can live in this repo at
first under `packages/tool-catalog` or in a separate `lush-tools` repo once it
needs independent release cadence.

Each tool entry should be data-first:

```text
tools/
  github/
    create_issue.tool.yaml
    search_repositories.tool.yaml
    README.md
    tests/
      create_issue.input.json
      create_issue.output.json
```

Tool definitions should contain:

- stable ID, title, description
- source kind: native, MCP, OpenAPI
- input and output schema
- required auth scopes
- effect classification
- approval policy
- timeout/retry policy
- examples
- test fixtures
- owner and review metadata

The five-minute path should be:

1. Add a YAML/JSON manifest.
2. Point it at an OpenAPI operation, MCP tool, or native implementation.
3. Run `bun run tools:validate`.
4. Generate type wrappers and docs.
5. Add fixture-based tests.

Native TypeScript tools can take slightly longer, but the scaffold should still
be one command:

```sh
bun run tools:new github create_issue --kind openapi
```

### Organization Tool Gateway

Organizations install and configure tool sources:

- public catalog tools
- organization-authored custom tools
- remote MCP servers
- local/managed MCP server processes
- OpenAPI specs

The organization layer stores credentials, policy, and enablement. The public
catalog never stores organization secrets.

Recommended database tables:

- `tool_catalog_sources`
- `tool_definitions`
- `organization_tool_sources`
- `organization_tool_installations`
- `organization_tool_credentials`
- `tool_call_logs`
- `tool_policy_bindings`

## MCP Client Plan

Lush should implement MCP client capability inside `services/tools`.

Required MCP support:

- connect to remote HTTP/SSE MCP servers
- connect to stdio MCP servers for local/self-hosted deployments
- list tools
- call tools
- list/read resources
- list/read resource templates
- list/get prompts
- handle OAuth for protected remote MCP servers
- handle elicitation requests explicitly, gated by product policy
- cache discovered tool metadata with version/fingerprint tracking
- detect server metadata changes and require re-approval when risk changes

The Vercel AI SDK `@ai-sdk/mcp` package is a useful implementation candidate.
Its `createMCPClient` API creates an MCP client, converts MCP tools into AI SDK
tools, supports resources/prompts/elicitation, and supports HTTP/SSE-style
transport config plus custom transports. Its docs also call out redirect
handling and OAuth provider support for protected remote MCP servers. Evaluate
it during implementation, but keep it behind a Lush-owned `McpClientAdapter`
interface so the domain model does not depend on SDK-specific types.

MCP tools should be treated as imported tool definitions, not blindly passed
through to the model. On import:

- namespace the tool ID
- snapshot the server-reported schema and description
- compute a metadata fingerprint
- classify effects conservatively
- require admin approval for unknown or changed effect classes
- optionally override descriptions with Lush-reviewed descriptions
- store server identity, transport, and auth method

## OpenAPI Tool Plan

OpenAPI should be a first-class source kind because it is the fastest path for
many SaaS APIs.

An OpenAPI tool definition should point at:

- spec URL or checked-in spec path
- operation ID
- auth scheme binding
- parameter/body mapping
- response projection
- error mapping

The gateway should generate:

- JSON schema for model input
- a typed executor wrapper
- fixture tests
- docs-page snippet

Do not expose raw OpenAPI operation shapes by default. They are often too broad
or poorly described for model use. Each operation should have a Lush-facing
description, examples, effect classification, and response projection.

## Native Tool Plan

Native tools are TypeScript modules inside `services/tools` or a package such
as `packages/tool-catalog`.

Native tool file shape:

```ts
export const tool = defineTool({
  id: "catalog.github.create_issue",
  title: "Create GitHub issue",
  description: "Create an issue in a repository the user can access.",
  inputSchema,
  outputSchema,
  effects: ["write", "external_side_effect"],
  authzAction: "tool.github.create_issue",
  approval: { mode: "required" },
  execute: async (input, context) => {
    // context contains organizationId, userId, sessionId, agentId, traceId
  }
});
```

The important part is that `execute` receives only a Lush context object and a
validated input. It should never need to parse JWTs, load sessions, or find
organization credentials manually.

## Authorization Model

Tool calls must be authorized at two levels:

1. Tool availability: may the agent see this tool in this session?
2. Tool execution: may this principal execute this exact call with this input?

Availability checks should consider:

- organization
- user and membership role
- session owner
- agent ID
- workspace mode
- installed tool source
- tool policy bindings
- effect class

Execution checks should happen immediately before execution and use the same
principal shape the agent used to build context. The agent should pass a
session-context principal to the tools service, not a service principal.

Suggested authz action pattern:

```text
tool.call
tool.read
tool.write
tool.source.manage
tool.catalog.install
tool.credential.manage
tool.github.create_issue
tool.linear.create_issue
```

Specific actions can be derived from catalog metadata, but broad actions should
exist for defaults and admin UI.

For user-delegated SaaS tools, credentials should be bound to either:

- the organization installation, if the tool acts as an organization bot; or
- the user connection, if the tool acts as the user.

The tool definition must declare which credential mode it supports. The runtime
must reject calls when the credential mode is incompatible with policy.

## Approval Model

Approval is separate from authz. Authz answers "is this allowed?" Approval
answers "should this specific action require explicit human confirmation?"

Default policy:

- read-only tools: no approval unless sensitive data class requires it
- write tools: approval required by default
- external side effects: approval required by default
- secret access: approval required by default
- organization admin tools: approval required and admin-only

Approval records should include:

- tool call ID
- input hash and redacted input preview
- approving user
- session ID
- model step/tool-call ID
- expiration

The model should receive structured approval denial results and should be
instructed not to retry denied calls without meaningful input changes.

## Observability

Every tool discovery and call should emit OpenTelemetry spans from
`services/tools`.

Suggested spans:

```text
tools.resolve_available
tools.mcp.connect
tools.mcp.list_tools
tools.openapi.load_spec
tools.call
tools.call.remote
tools.approval.request
tools.approval.resolve
```

Suggested span attributes:

```text
lush.organization_id
lush.user_id
lush.session_id
lush.agent_id
lush.tool.id
lush.tool.source_kind
lush.tool.source_id
lush.tool.effect_classes
lush.tool.approval_required
lush.tool.approved
lush.tool.result_status
lush.tool.error_code
```

Do not put raw input, output, credentials, prompts, or PII into span attributes.
Put redacted previews and hashes in durable logs when needed.

Durable `tool_call_logs` should store:

- call ID
- session ID
- model step/tool-call ID
- tool ID and version
- principal
- input hash
- redacted input preview
- redacted output preview
- status
- latency
- error code
- remote request ID
- trace/span IDs

## Security Rules

- Never pass raw user credentials or organization secrets to the model.
- Never let the agent call arbitrary URLs. All network egress goes through a
  registered tool source.
- Deny by default when tool metadata changes materially.
- Treat MCP descriptions as untrusted input.
- Classify tool effects conservatively.
- Require admin approval to install arbitrary remote MCP servers.
- Restrict stdio MCP servers in managed deployments.
- Use outbound allowlists for remote MCP/OpenAPI sources.
- Enforce timeouts, response size limits, and per-session tool budgets.
- Keep tool result rendering separate from raw remote responses.
- Redact logs at the tools service boundary.

## Agent Runtime Integration

The agent service should not own tool configuration. It should:

1. Build the session context as it does today.
2. Ask `services/tools` for the authorized tool set:

   ```ts
   resolveTools({
     organizationId,
     userId,
     sessionId,
     agentId,
     mode: "chat"
   })
   ```

3. Convert returned `ToolDefinition`s into the provider-specific tool format.
4. Stream model output.
5. For each model tool call, call `services/tools.executeTool`.
6. Append tool call/result messages to session history.
7. Continue the model loop until completion, stop condition, budget exhaustion,
   approval request, or error.

The tool gateway should expose both:

- an in-process package API for local monorepo integration; and
- an HTTP API for service isolation and future remote agent runtimes.

The API service remains the public client entry point. End-user clients should
not execute tools directly except for explicit approval UX.

## Model Interface

Internally, Lush should normalize to its own `ToolDefinition`. At the model
edge, adapters can emit:

- provider-native tool schemas for OpenAI-compatible/Anthropic-style calls
- Vercel AI SDK `tool()` objects if the inference runtime adopts AI SDK
- MCP-derived tools through `@ai-sdk/mcp` if we choose that adapter

This keeps the system portable. Lush should be able to swap model providers or
tool libraries without rewriting the catalog, policy, audit, and authz layers.

## Tool Authoring Workflow

Target command set:

```sh
bun run tools:new <source> <tool> --kind native
bun run tools:new <source> <tool> --kind openapi --operation <operationId>
bun run tools:import-mcp <source> --url <url>
bun run tools:validate
bun run tools:test
bun run tools:docs
```

For a straightforward OpenAPI-backed tool, the coding-agent workflow should be:

1. Read API docs or OpenAPI operation.
2. Scaffold manifest.
3. Fill description, examples, auth scope, effect class, and response
   projection.
4. Add fixture input/output.
5. Run validation/tests.
6. Submit PR.

The validation command should fail on:

- missing description
- vague description
- absent effect classification
- absent authz action
- missing input schema
- unbounded output
- missing timeout
- write effect without approval policy
- credential mode mismatch
- no fixture tests

## Implementation Phases

### Phase 0: Design Lock

- Land this plan.
- Decide whether to add `@ai-sdk/mcp` for the MCP client adapter spike.
- Decide where the public catalog starts: this repo vs separate repo.

### Phase 1: Tool Domain Package

- Add `packages/tool-catalog` or expand `services/tools/src` with domain types.
- Add schema validation for `ToolDefinition`.
- Add manifest parser and fixture-test runner.
- Add `defineTool()` helper for native TypeScript tools.
- Add docs generator for catalog entries.

### Phase 2: Tools Service Persistence

- Add DB migrations for tool sources, definitions, installations, credentials,
  policy bindings, and call logs.
- Add API routes for listing available tools and managing organization
  installations.
- Add authz actions for tool management and execution.

### Phase 3: Execution Gateway

- Implement `resolveTools(context)`.
- Implement `executeTool(call)`.
- Add native adapter.
- Add OpenTelemetry spans and durable call logs.
- Add redaction utilities and size limits.

### Phase 4: MCP Client

- Implement `McpClientAdapter`.
- Support remote HTTP/SSE MCP transport first.
- Support stdio transport for local/self-hosted mode.
- Import MCP tools into normalized `ToolDefinition`s.
- Store metadata fingerprints and detect changes.
- Add admin install flow and policy approval.

### Phase 5: OpenAPI Adapter

- Implement OpenAPI operation import.
- Generate schemas, executor wrappers, examples, and fixture tests.
- Add response projection DSL.

### Phase 6: Agent Loop

- Add tool resolution to the agent chat path.
- Convert authorized tools to model-provider schemas.
- Execute model tool calls through `services/tools`.
- Persist tool call/result messages in sessions.
- Add approval interruption/resume flow.
- Add per-session and per-step tool budgets.

### Phase 7: UI

- Add organization tool catalog/settings views.
- Add MCP server installation flow.
- Add credential connection flow.
- Add approval UI.
- Add per-session tool call transcript and trace links.

## First Vertical Slice

The first useful slice should be deliberately small:

1. One native read-only tool, such as `catalog.time.now` or
   `catalog.session.summarize`.
2. One OpenAPI-backed read tool.
3. One remote MCP server import in local dev.
4. Agent chat can resolve the authorized tools and execute one call.
5. Tool call/result is persisted to the session.
6. OTel spans and durable call logs exist.
7. Tests cover authz denial, schema validation, timeout, redaction, and session
   principal propagation.

## Open Questions

- Should the OSS public catalog live in this monorepo initially, or start in a
  separate repo with independent versioning?
- Which MCP transports are acceptable in managed hosted deployments? Remote
  HTTP/SSE should be fine; stdio likely needs self-hosted/local-only policy.
- How much of MCP resources/prompts should be model-visible by default versus
  explicit context-building tools?
- Should tool approval be session-scoped, run-scoped, or call-scoped by default?
- Should organizations be able to override public catalog descriptions, or only
  disable tools and configure policy?
- What is the minimum UI needed for a safe arbitrary MCP install?

## Working Decisions

- The canonical noun is `Tool`.
- MCP is a source kind and protocol, not the internal domain model.
- The tools service is the only execution gateway.
- The agent acts with the session-context principal, never with ambient service
  authority.
- Tool definitions are data-first so a coding agent can scaffold and validate
  them quickly.
- Authz, approval, observability, and redaction are part of the tool gateway,
  not optional adapter code.

## References

- Vercel AI SDK tool calling docs: AI SDK tools define descriptions, input
  schemas, optional execute functions, strict mode, approval, active tool
  selection, and extraction patterns.
- Vercel AI SDK MCP docs: `createMCPClient` can connect to MCP servers and
  expose tools/resources/prompts/elicitation through an MCP client interface.
- Vercel AI SDK guidance distinguishes AI SDK tools from MCP tools: SDK tools
  are better for production control and type safety; MCP tools are strongest
  for rapid iteration and user-provided tools.
