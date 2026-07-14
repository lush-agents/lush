# Code Plan

## Status

Proposed architecture and delivery plan.

The first implementation targets Codex, Claude Code, and OpenCode. Pi and Amp
follow as adapter conformance tests. Supporting all five without changing the
core domain model is the confidence threshold for treating the harness
abstraction as correctly scoped.

## Design Review Disposition

The following decisions incorporate the first external review of this plan.

| Review point | Disposition |
| --- | --- |
| The first milestone carries too much generality | Accept. Define a narrow local dogfood slice and explicitly defer speculative environment features. |
| Event normalization is underspecified | Accept. Phase 0 produces concrete discriminated schemas and golden mappings, not `data: unknown`. |
| Evaluate Agent Client Protocol (ACP) | Accept. ACP becomes the preferred harness transport where available, with a documented gap analysis and Lush extensions at the domain boundary. |
| `HarnessId` prevents third-party adapters | Accept. Replace the closed union with registry-defined IDs and adapter manifests. |
| Protocol drift and resume compatibility arrive too late | Accept. Version policy and automated drift detection move into Phases 0 and 2. |
| Managed consumer-subscription authentication may be unavailable | Accept as a release gate. Managed harness availability requires an official credential and licensing path with viable economics. |
| Raw payload retention is unsafe by default | Accept. Raw payload persistence is off by default and redaction must happen before any diagnostic write. |
| Human implementation effort is roughly a year | Push back on coding throughput, accept the risk concentration. Adapter glue is regenerable; schemas, fixtures, conformance, and security review are the durable work. |
| Checkpoint/restore is speculative | Accept. Remove it from the required environment interface and treat it as an optional managed capability. |

The practical consequence is that Phase 0 is not preliminary scaffolding. It
is the core product-engineering phase. Adapter implementations should be cheap
to regenerate from current upstream schemas and fixtures; the stable assets are
the canonical event model, conformance suite, compatibility policy, and safety
invariants.

## Objective

Build Lush Code as a best-in-class client and orchestrator for existing coding
harnesses rather than as another coding harness.

Lush should own:

- execution target selection;
- repository and workspace selection;
- local worktree lifecycle;
- session indexing and resume;
- a consistent conversation, activity, approval, and diff-review experience;
- normalized observability and durable audit records; and
- Lush-managed organization tools exposed to compatible harnesses.

The selected harness should continue to own:

- its agent loop and context management;
- built-in filesystem, search, edit, and shell tools;
- model-specific behavior and configuration;
- its native session state; and
- authentication with its inference provider or subscription.

The success criterion for the first product milestone is concrete: a developer
can use Lush Code to implement a scoped change in the Lush repository, inspect
the activity and patch, run validation, request a revision, and accept the
result without switching to another coding-agent client.

## First Dogfood Slice

The first milestone is intentionally local and single-repository:

- desktop local execution on the current machine;
- one primary Git repository;
- a default-on Lush-managed worktree;
- Codex, Claude Code, and OpenCode through ACP where viable or direct structured
  adapters where required;
- typed session, message, command, tool, diff, approval, usage, and completion
  events;
- resume, cancellation, bounded process output, and safe worktree retention;
- the inline preflight composer and active-session experience; and
- enough local preview/browser handoff to validate a Lush frontend change.

The following remain represented in the architecture but are not prerequisites
for the first dogfood milestone:

- managed sandbox execution;
- SSH and remote-control targets;
- environment checkpoint/restore and hibernation;
- writable multi-root or coordinated multi-repository workspaces;
- generalized artifact pipelines beyond diffs, logs, and screenshots;
- automated browser operation beyond the initial local validation path;
- cross-harness usage analytics; and
- Pi and Amp adapters.

Interfaces for deferred features should be added only when an implementation or
second concrete consumer requires them. Capability flags may reserve product
vocabulary, but the core runtime should not contain no-op methods for
speculative backends.

## Product Modes

Code has two execution modes.

| Client | Local mode | Managed sandbox mode |
| --- | --- | --- |
| Desktop app | Available | Available |
| Hosted web app | Unavailable | Available |

### Local mode

Local mode runs an installed coding harness on the developer's machine against
a local repository. Lush manages a dedicated Git worktree by default and sends
the worktree path to the harness as its working directory.

Local mode is for:

- using existing CLI installations and subscription authentication;
- operating on repositories already present on the machine;
- preserving the native harness's configuration, skills, and project files;
- low-latency iteration; and
- offline or private-network development where supported by the harness.

Local mode is available only in the desktop app because it requires local
process, filesystem, and Git access. The hosted web app must never accept a
browser-supplied local path and imply that it can execute there.

### Managed sandbox mode

Managed mode provisions an isolated remote execution environment, checks out
the repository into that environment, and runs the selected harness there.
The desktop and hosted web apps use the same managed execution API.

Managed mode is for:

- sessions started from any device;
- shared organization policy and credentials;
- durable background execution;
- centrally managed network and filesystem policy;
- reproducible runtime images; and
- collaboration and handoff across clients.

The managed runtime owns containment. A repository checkout or Git worktree
inside the sandbox is not the security boundary; the sandbox is.

### Execution targets

Execution mode describes who owns the security boundary. An execution target
identifies the concrete machine or managed environment.

```ts
type ExecutionTarget =
  | { kind: "local"; deviceId: string }
  | { kind: "managed"; environmentProfileId: string }
  | { kind: "user-managed-remote"; connectionId: string };
```

The first release implements `local` and `managed`. Desktop-only SSH hosts and
remote-control daemons are a useful future extension, but they remain
user-managed remote targets rather than being presented as Lush-managed
sandboxes. They require their own trust, credential, reachability, and process
lifecycle model. The hosted web app remains managed-only.

The target selector should show connection health and settings for each target.
Managed organizations may expose multiple named environment profiles. Changing
the target revalidates repository availability, harness availability, model
selection, and policy before the first turn starts.

## Execution Topology

The UI consumes one Code orchestration contract regardless of execution mode.
Transport and process placement differ.

```text
Desktop local

React client
    -> Tauri IPC / authenticated local socket
    -> Lush local agent sidecar
    -> harness adapter
    -> installed CLI or SDK
    -> Lush-managed Git worktree

Desktop or hosted web managed

React client
    -> Lush API
    -> agent orchestration service
    -> managed sandbox runtime
    -> harness adapter
    -> harness CLI or SDK
    -> sandbox repository checkout
```

The adapter implementations and normalized event model should live under the
`services/agent` boundary and be reusable by both executors. React must not
parse harness protocols, manage child processes, or contain Git lifecycle
logic.

For local mode, the likely first implementation is a Bun-compiled sidecar built
from `services/agent` and launched on demand by Tauri. This keeps the TypeScript
adapter ecosystem and current service boundary while avoiding a second set of
protocol implementations in Rust. The sidecar should stop after an idle period
when no Code sessions are active. Sidecar size, cold start, and steady-state
memory must be measured before this becomes final packaging architecture.

The local transport should be Tauri IPC, a Unix domain socket, or an
authenticated loopback channel with a per-launch capability token. An
unauthenticated fixed localhost port is not an acceptable shipped boundary.

## Execution Environment Contract

The harness adapter and execution environment are separate abstractions.

- The harness adapter translates sessions, turns, events, approvals, and
  harness-specific controls.
- The execution environment provides the workspace, processes, tools,
  isolation, connectivity, and artifacts in which the harness operates.

This separation matters because a strong coding harness performs poorly in an
incomplete environment. The target is not merely "a shell plus a repository."
The target is the complete loop required for an agent to inspect, implement,
run, observe, validate, and deliver software.

```ts
interface CodeExecutionEnvironment {
  readonly handle: ExecutionHandle;
  readonly capabilities: ExecutionEnvironmentCapabilities;

  inspect(): Promise<ExecutionEnvironmentState>;
  startProcess(request: ProcessRequest): Promise<ProcessHandle>;
  exposePort(request: PortExposureRequest): Promise<PortExposure>;
  dispose(): Promise<void>;
}

type ExecutionEnvironmentCapabilities = {
  filesystem: "workspace" | "scoped-roots";
  shell: boolean;
  interactiveProcesses: boolean;
  backgroundProcesses: boolean;
  networkPolicy: "host" | "managed" | "none";
  secrets: boolean;
  mcp: boolean;
  browser: boolean;
  portForwarding: boolean;
  imageInspection: boolean;
  checkpoints: boolean;
  subagents: boolean;
  platform: string;
};

interface CheckpointCapableEnvironment extends CodeExecutionEnvironment {
  checkpoint(request: CheckpointRequest): Promise<Checkpoint>;
  restore(checkpointId: string): Promise<void>;
}
```

The base interface is conceptual. Optional extensions such as
`CheckpointCapableEnvironment` exist only when a real executor implements
them. Harnesses may execute commands internally rather
than calling `startProcess` through Lush. The orchestrator still owns the
environment lifecycle and must be able to describe, constrain, observe, and
terminate the resulting process tree.

### Ideal agent loop

Both local and managed modes should support this loop where the platform allows
it:

1. discover repository instructions, skills, configuration, and available
   tools;
2. inspect files, symbols, history, dependencies, and current Git state;
3. form and update a visible plan for substantial work;
4. edit files and run commands in an explicitly scoped workspace;
5. keep long-running processes alive and read incremental output;
6. start development servers and reach them through authenticated preview
   URLs;
7. automate a browser, inspect rendered output, and capture screenshots;
8. inspect generated images, documents, logs, and other artifacts;
9. ask for missing input or request narrowly scoped permissions;
10. delegate bounded work to parallel agents where the harness supports it;
11. run repository validation and compare the final diff to the requested
    task; and
12. resume or hand off the session without losing execution context, using an
    environment checkpoint only where the executor supports one.

These capabilities should be first-class environment features rather than
prompt conventions. A managed agent should not need to invent port forwarding,
process supervision, or artifact transport through shell scripts.

### Environment manifest

Every run receives a resolved, inspectable environment manifest:

```ts
type ExecutionEnvironmentState = {
  platform: {
    os: string;
    architecture: string;
  };
  workspaceRoots: Array<{
    id: string;
    path: string;
    access: "read" | "write";
  }>;
  repository: {
    root: string;
    branch: string | null;
    head: string;
    worktree: boolean;
  };
  commands: Record<string, { path: string; version?: string }>;
  services: Array<{
    name: string;
    status: "starting" | "ready" | "failed" | "stopped";
    previewUrl?: string;
  }>;
  tools: Array<{
    id: string;
    source: "native" | "mcp" | "lush";
  }>;
  policy: {
    filesystem: unknown;
    network: unknown;
    approvals: unknown;
  };
};
```

The manifest is shown to the user and made available to the harness through its
native initialization mechanism, MCP, or a generated context document. It must
not contain secret values.

### Tooling baseline

The Lush-provided baseline environment should include fast, predictable
developer primitives:

- Git and common credential helpers;
- a POSIX-compatible shell where the platform supports one;
- `rg`, `find`, `jq`, archive tools, and patch/diff support;
- language and package-manager discovery;
- bounded process execution with stdout/stderr streaming;
- a process registry for background tasks;
- authenticated preview-port registration;
- artifact collection; and
- an MCP endpoint for Lush-managed organization tools.

Repository-specific runtimes should come from an explicit project definition
when possible. Managed-mode resolution should prefer, in order:

1. a future Lush environment manifest;
2. a repository dev-container or reproducible environment definition;
3. checked-in runtime manager configuration;
4. lockfile and project-file detection; and
5. an explicit user-selected base image.

Automatic installation must produce a plan and require approval when it changes
the repository, downloads executable code outside declared setup, or materially
changes cost or network access.

### Process and preview lifecycle

Coding work frequently depends on processes that outlive one harness turn. The
orchestrator therefore maintains a process registry independent of the harness
transcript.

Each process record includes command, working directory, environment-key names,
start time, status, exit code, owner session, bounded logs, and exposed ports.
Secret values are never persisted. Interrupting a turn does not automatically
terminate a development server; ending or destroying the environment does.

Desktop local mode can expose loopback services directly after confirming the
port belongs to the managed process. Managed mode uses authenticated,
session-scoped preview URLs and must not expose arbitrary sandbox ports to the
public internet.

Browser automation should run in an isolated Lush-controlled browser context by
default. Attaching to a developer's existing browser profile is a separate,
explicit capability because it carries cookies, sessions, extensions, and
other sensitive state.

### Parallel agents and write domains

Harness-native subagents may share the parent environment when the harness
coordinates their writes. Lush records their activity and parent-child
relationship but does not impose a second scheduling model inside the harness.

Independent Lush sessions are separate write domains:

- local independent writers receive separate worktrees;
- managed independent writers receive separate environments or isolated
  checkouts; and
- attaching a second writer to an existing worktree requires explicit user
  confirmation.

This rule preserves parallelism without assuming that every harness implements
subagents in the same way.

### Platform fidelity

The environment reports its actual platform and does not imply validation it
cannot perform. A Linux managed sandbox can validate most web and service code,
but it cannot prove a macOS Tauri package or Apple signing flow. Those tasks
require local mode on macOS or a future managed macOS executor.

Validation results are tagged with environment identity, platform, repository
commit, and harness version so users can distinguish portable checks from
platform-specific checks.

## Domain Model

### Code workspace

A code workspace describes where a harness can work without conflating a local
filesystem path with a durable cross-device project.

```ts
type CodeWorkspace = {
  id: string;
  executionMode: "local" | "managed";
  executionTargetId: string;
  repository: RepositoryIdentity;
  checkout: LocalCheckout | ManagedCheckout;
  roots: WorkspaceRoot[];
};
```

`RepositoryIdentity` should prefer a stable VCS identity such as a normalized
remote plus provider repository ID when available. A local-only repository may
use an opaque local ID. Absolute local paths stay in the local sidecar store and
must not be synced into organization session state.

### New-session draft

Before first send, Code holds a draft rather than a durable session:

```ts
type CodeSessionDraft = {
  executionMode: "local" | "managed";
  executionTargetId: string;
  repository: RepositorySelection;
  baseRef: string;
  useWorktree: boolean;
  additionalRoots: WorkspaceRootSelection[];
  harnessId: HarnessId;
  model?: string;
  serviceTier?: string;
  effort?: string;
  autonomyMode: "plan" | "manual" | "accept-edits" | "auto" | "bypass";
  prompt: HarnessInput;
};
```

Draft validation resolves display selections into immutable identifiers and
returns the effective harness and environment policy. No native harness thread,
Git branch, worktree, managed environment, or durable Lush session exists until
`startCodeSession` accepts the validated draft and initial input.

### Code session binding

A Lush session remains the user-facing durable thread. A harness binding records
how execution resumes.

```ts
type HarnessSessionBinding = {
  harnessId: HarnessId;
  harnessVersion: string;
  adapterId: string;
  adapterVersion: string;
  transport: "acp" | "native-rpc" | "sdk" | "structured-cli";
  transportProtocolVersion: string;
  eventSchemaVersion: number;
  externalSessionId: string;
  workspaceId: string;
};
```

The harness's native session is the source of truth for future model context.
Lush stores normalized events for rendering, search, audit, and recovery. Lush
also retains versioned raw harness events for debugging and forward-compatible
reprocessing, subject to retention and redaction policy.

If a native local session is missing, the Lush transcript remains readable but
the session is marked unavailable for resume. Lush must not silently reconstruct
a harness session from lossy rendered text.

### Execution handle

The UI and orchestrator refer to a target-neutral execution handle. Local paths,
sandbox IDs, and provider runtime details remain executor-specific.

```ts
type ExecutionHandle =
  | { mode: "local"; localWorkspaceId: string; worktreeId?: string }
  | { mode: "managed"; environmentId: string; checkoutId: string };
```

## Harness Adapter Contract

The contract must normalize lifecycle without reducing every harness to the
smallest feature set.

```ts
type HarnessId = string;

const builtInHarnessIds = {
  codex: "codex",
  claudeCode: "claude-code",
  opencode: "opencode",
  pi: "pi",
  amp: "amp",
} as const;

type HarnessAdapterManifest = {
  id: HarnessId;
  displayName: string;
  adapterVersion: string;
  transport: "acp" | "native-rpc" | "sdk" | "structured-cli";
  supportedHarnessVersions: string;
  factory: CodingHarnessAdapterFactory;
};

interface CodingHarnessAdapter {
  readonly id: HarnessId;

  probe(context: ProbeContext): Promise<HarnessInstallation>;
  start(options: HarnessStartOptions): Promise<HarnessSession>;
  resume(options: HarnessResumeOptions): Promise<HarnessSession>;
}

interface HarnessSession {
  readonly binding: HarnessSessionBinding;
  readonly capabilities: HarnessCapabilities;
  readonly events: AsyncIterable<HarnessEvent>;

  send(input: HarnessInput): Promise<void>;
  respond(request: HarnessInteractionResponse): Promise<void>;
  interrupt(): Promise<void>;
  dispose(): Promise<void>;
}
```

Adapters are resolved from a registry rather than a core union. Built-in
adapters ship with Lush; organization and third-party adapters may be installed
only through a signed or explicitly trusted extension path. Extensibility does
not permit a remote client to nominate an arbitrary local executable.

### Required baseline capabilities

Every supported adapter must provide:

- installation and version detection;
- start in an explicit working directory;
- structured event streaming;
- an external session identifier;
- multi-turn resume;
- cancellation;
- terminal failure reporting; and
- final completion status.

### Optional capabilities

Adapters advertise optional behavior instead of forcing fake parity:

```ts
type HarnessCapabilities = {
  approvals: "interactive" | "policy-only" | "unsupported";
  steering: boolean;
  sessionFork: boolean;
  subagents: boolean;
  additionalWorkspaceRoots: boolean;
  autonomyModes: Array<"plan" | "manual" | "accept-edits" | "auto" | "bypass">;
  modelSelection: boolean;
  serviceTierSelection: boolean;
  reasoningStream: boolean;
  structuredDiffs: boolean;
  mcp: boolean;
  nativeSandbox: boolean;
};
```

The Code UI renders controls only when the active adapter and executor support
them. The baseline interaction remains consistent, while native capabilities
such as steering, session forks, or richer approval decisions remain available.

### Normalized event envelope

The event model is a discriminated union with a concrete payload schema per
kind. `unknown` is permitted only inside explicitly opaque vendor metadata that
is neither rendered nor trusted for policy decisions.

```ts
type EventBase<Kind extends string, Data> = {
  id: string;
  sequence: number;
  occurredAt: string;
  harnessId: HarnessId;
  externalSessionId: string;
  turnId?: string;
  kind: Kind;
  data: Data;
  diagnostic?: RawEventReference;
};

type HarnessEvent =
  | EventBase<"session.started", SessionStartedData>
  | EventBase<"turn.started", TurnStartedData>
  | EventBase<"message.delta", MessageDeltaData>
  | EventBase<"reasoning.delta", ReasoningDeltaData>
  | EventBase<"tool.started" | "tool.updated" | "tool.completed", ToolEventData>
  | EventBase<"command.started" | "command.completed", CommandEventData>
  | EventBase<"command.output", CommandOutputData>
  | EventBase<"file.changed", FileChangedData>
  | EventBase<"diff.updated", DiffUpdatedData>
  | EventBase<"approval.requested", ApprovalRequestedData>
  | EventBase<"interaction.requested", InteractionRequestedData>
  | EventBase<"usage.updated", UsageUpdatedData>
  | EventBase<"turn.completed" | "turn.failed", TurnCompletedData>;

type MessageDeltaData = {
  messageId: string;
  role: "assistant";
  format: "markdown" | "text";
  delta: string;
};

type ReasoningDeltaData = {
  blockId: string;
  visibility: "summary" | "native";
  delta: string;
};

type ToolEventData = {
  toolCallId: string;
  kind: "read" | "edit" | "delete" | "move" | "search" | "execute" | "think" | "fetch" | "other";
  name: string;
  title: string;
  status: "pending" | "running" | "completed" | "failed" | "declined";
  input?: JsonValue;
  content?: ToolContent[];
  error?: StructuredError;
};

type CommandEventData = {
  commandId: string;
  command: string[];
  cwd: WorkspaceRelativePath;
  status: "running" | "completed" | "failed" | "declined";
  exitCode?: number;
  durationMs?: number;
};

type CommandOutputData = {
  commandId: string;
  stream: "stdout" | "stderr" | "combined";
  chunk?: string;
  artifactRef?: string;
  truncated: boolean;
};

type FileChangedData = {
  path: WorkspaceRelativePath;
  operation: "create" | "update" | "delete" | "move";
  previousPath?: WorkspaceRelativePath;
  status: "proposed" | "applied" | "failed" | "declined";
};

type DiffUpdatedData = {
  baseCommit: string;
  patch?: string;
  artifactRef?: string;
  files: Array<{ path: WorkspaceRelativePath; additions?: number; deletions?: number }>;
};

type ApprovalRequestedData = {
  interactionId: string;
  category: "command" | "file-change" | "network" | "filesystem" | "tool";
  title: string;
  detail?: string;
  requestedScope: JsonValue;
  options: Array<{ id: string; label: string; scope: "once" | "session" }>;
};

type UsageUpdatedData = {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  costUsd?: number;
  source: "harness-reported" | "provider-reported" | "estimated";
};

type TurnCompletedData = {
  status: "completed" | "failed" | "interrupted";
  error?: StructuredError;
  usage?: UsageUpdatedData;
};

type RawEventReference = {
  protocol: string;
  protocolVersion: string;
  digest: string;
  supportBundleRef?: string;
};
```

The full Phase 0 schema also defines `SessionStartedData`, `TurnStartedData`,
`ToolContent`, `InteractionRequestedData`, `StructuredError`, path rules, size
limits, and forward-compatible unknown-enum behavior. The examples above commit
the plan to typed payloads without pretending the plan itself is the schema
package.

Normalization happens once in the adapter. Persisted events and live UI events
use the same contract. Large command output, patches, and artifacts are stored
out of line with bounded references.

### Raw payload retention

Raw harness payloads are not persisted by default in either execution mode.
The canonical event is the durable record.

- Local mode may keep a bounded in-memory diagnostic ring. The user can
  explicitly create an encrypted support bundle after reviewing its contents.
- Managed mode diagnostic capture is disabled by default. Organization policy
  may enable a short-TTL encrypted capture for a specific session.
- Adapters redact through an allowlist before any raw payload crosses a durable
  storage boundary. Redaction after persistence is not sufficient.
- Command output is governed separately: it is bounded, truncatable, clearable,
  and subject to secret-pattern filtering before persistence.
- Diagnostic references contain a digest and optional support-bundle pointer,
  never an inline `unknown` payload.

### ACP strategy

Lush adopts the Agent Client Protocol as the preferred harness transport where
an upstream or well-maintained adapter is available. ACP protocol version 1
already covers capability negotiation, session setup and resume, configuration
options, streaming session updates, tool-call lifecycle, rich tool content,
permission requests, and client terminal/filesystem capabilities.

ACP does not replace the Lush orchestration domain. Worktree ownership,
execution-target selection, managed sandbox policy, durable event retention,
cross-device session indexing, credential brokerage, and requested-versus-
effective autonomy remain Lush responsibilities.

Phase 0 produces an ACP gap matrix:

1. map ACP session updates and tool kinds to the canonical Lush event schemas;
2. map ACP permission options to Lush interaction and policy semantics;
3. identify information lost by the available ACP adapters for the five target
   harnesses;
4. prefer upstream ACP adapters when they meet baseline conformance;
5. retain direct adapters only for missing capabilities or unsupported
   harnesses; and
6. avoid private ACP wire extensions when the same information can remain in
   the Lush orchestration layer.

Lush should also be able to expose its own harness adapters through ACP later,
making the adapter ecosystem useful outside the Lush client.

### Harness-specific surfaces

| Harness | Preferred integration | Notes |
| --- | --- | --- |
| Codex | Conformant ACP adapter, otherwise `codex app-server` | App-server supplies generated schemas and richer thread/turn/item, approval, interruption, resume, and fork data when ACP loses required detail. |
| Claude Code | Conformant ACP adapter, otherwise Agent SDK or bidirectional stream JSON | Direct permission callbacks remain available when the ACP adapter cannot express the effective policy. |
| OpenCode | Conformant ACP adapter, otherwise headless server/OpenAPI and SSE | `run --format json` remains useful for fixtures and a minimal direct fallback. |
| Pi | `pi --mode rpc` or TypeScript SDK | JSONL RPC is explicitly intended for custom host UIs. Pi's default security posture requires Lush-side containment or an extension policy. |
| Amp | `@ampcode/sdk` or CLI stream JSON | SDK supports streaming input/output, thread continuation, MCP, and programmatic permissions. |

Formatted terminal output and screen scraping are not supported integration
contracts. A PTY may be added later as an explicitly degraded compatibility
adapter, but it cannot define the primary event model.

### Version compatibility and drift

Every adapter manifest declares its adapter version, supported harness-version
range, transport, ACP protocol version where applicable, and canonical event
schema version. The session binding records all of them.

Resume policy:

1. resume directly when the installed harness and negotiated protocol remain in
   the recorded compatible range;
2. perform a non-mutating compatibility probe when the installed version is
   newer but plausibly compatible;
3. update the binding only after the probe and fixture contract pass;
4. keep the transcript readable but block execution when compatibility is
   unknown or broken; and
5. offer a pinned managed runtime or actionable local install guidance rather
   than attempting a lossy transcript reconstruction.

Lush does not silently upgrade local harnesses. Managed environments pin the
harness build and adapter by image digest for the life of a resumable session.

Protocol maintenance is fixture-driven:

- record sanitized native and ACP fixture streams for every supported release
  family;
- store the expected canonical event stream beside each fixture;
- run the suite against minimum, current, and latest upstream versions;
- use scheduled isolated CI to detect new releases and protocol drift;
- allow an agent to regenerate schemas or propose adapter patches; and
- require human review before publishing compatibility changes, especially for
  approval, redaction, process, filesystem, and credential behavior.

A latest-version failure does not break known-good users. It marks that release
unsupported, opens a maintenance report, and preserves the previous compatible
range until a reviewed adapter release passes conformance.

## Local Mode

### Harness discovery and authentication

The sidecar discovers supported executables using the effective desktop user
environment and records executable path, version, adapter compatibility, and
available capabilities.

Lush does not copy or upload local harness credentials. The harness continues
to use its native credential store and subscription login. The desktop UI may
launch the harness's official login flow, but Lush stores only resulting status,
not secrets.

GUI applications frequently receive a different `PATH` from interactive
shells. Discovery should support:

1. known installer locations;
2. the sidecar process environment;
3. login-shell lookup as an explicit fallback; and
4. a user-selected executable path stored locally.

An executable selected by a managed or hosted client must never be honored by a
local sidecar.

### Worktree policy

Lush-managed worktrees are the default local execution unit. The user's current
checkout is not modified by default. The new-session composer exposes a
default-on worktree toggle so an experienced user can explicitly run in the
selected checkout when that is the desired behavior.

New-session configuration is a draft until the first prompt is sent. Selecting
a repository, branch, harness, or worktree preference should not create empty
sessions, branches, or directories. On first send, the orchestrator validates
the complete draft, creates the worktree and native harness session, then
commits the Lush session binding. A partial failure rolls back only resources
created by that transaction and preserves the draft for correction.

For each new Code session with worktrees enabled, the orchestrator:

1. resolves the canonical repository root and Git common directory;
2. verifies that the source checkout is a supported non-bare Git repository;
3. resolves the selected base ref to an immutable commit SHA;
4. acquires a repository-scoped worktree mutation lock;
5. creates a Lush branch and worktree from that SHA;
6. persists local metadata before starting the harness; and
7. launches the harness with the worktree as its working directory.

If worktrees are disabled, the orchestrator binds the session to the existing
checkout and records its current branch and HEAD. It does not switch branches
implicitly. The UI must state that the harness will modify the selected
checkout directly and prevent a second independent writer from attaching by
default.

Default naming:

```text
branch:    lush/<short-session-id>-<slug>
worktree:  ~/.lush/worktrees/<repository-key>/<worktree-id>
```

`repository-key` is a filesystem-safe name plus a short hash of the canonical
Git common directory. `worktree-id` is an opaque generated ID, not user input.
The display name may be changed independently.

The underlying operation is equivalent to:

```sh
git worktree add -b <branch> <managed-path> <base-commit-sha>
```

Lush does not automatically fetch, pull, rebase, or choose a newer base. The UI
shows the exact base branch and commit before creation. Updating the base is an
explicit operation.

The base-branch picker is searchable and annotates the current branch, default
branch, remote-only branches, and branches already checked out in another
worktree. Selecting a branch while worktrees are enabled chooses the immutable
base commit for the new worktree; it does not check out that branch in the
source repository.

### Multi-root workspaces

A Code session has one primary repository root and may include explicitly added
folders. The composer represents these as compact removable context items and
offers an `Add folder` action next to repository and branch configuration.

Each root records purpose and effective access:

```ts
type WorkspaceRoot = {
  id: string;
  role: "primary" | "additional";
  access: "read" | "write";
  localPath?: string;
  managedMountId?: string;
};
```

Additional roots default to read-only. They are never implicitly branched,
cleaned, uploaded, or deleted. Enabling write access is a separate explicit
decision and must be supported by both the execution environment and harness
adapter. A future compound-workspace flow may create coordinated worktrees for
multiple repositories, but the first release manages a worktree only for the
primary repository.

Absolute additional-root paths remain local in local mode. Managed mode must
materialize each root from an approved repository or artifact source; a browser
cannot submit a desktop path. Adapters map roots to their native workspace-root
or additional-directory mechanism and report when a harness cannot honor them.

### Managed and external worktrees

Worktrees created by Lush are marked `managed`. A developer may also open an
existing checkout or worktree in `external` mode.

- Lush may create, rename metadata for, and remove managed worktrees.
- Lush never deletes an external checkout or worktree.
- A managed worktree has one active writer session by default.
- Additional sessions may attach read-only or only after explicit confirmation.
- Worktree creation and removal are serialized per repository.

On startup, the sidecar reconciles its local records with
`git worktree list --porcelain -z`. Missing directories, prunable metadata,
branch changes, and worktrees created outside Lush become explicit states in the
UI rather than being silently repaired.

### Cleanup and branch lifecycle

Closing a Code session does not automatically remove its worktree.

The user can:

- keep the worktree;
- open it in a terminal or editor;
- archive the Lush session while retaining local state;
- remove a clean managed worktree; or
- explicitly discard a dirty managed worktree after reviewing the status.

Safe removal rules:

- verify the target is a registered managed worktree;
- verify it is not the main checkout;
- inspect staged, unstaged, and untracked changes;
- refuse normal removal when changes or unpushed commits would be lost;
- require a separately worded destructive confirmation before forced removal;
- treat worktree removal and branch deletion as separate actions; and
- never implement cleanup with `git reset --hard` or `git clean`.

Lush may run `git worktree prune` only as an explicit reconciliation operation
after showing what metadata will be removed.

### Local security boundary

A Git worktree prevents concurrent agents from trampling the same checkout. It
does not constrain process access to the rest of the machine.

The UI must show the effective local protection level for every run:

- harness sandbox enabled and scope;
- native permission/approval policy;
- network policy where available;
- additional filesystem roots;
- whether the harness can invoke unsandboxed subprocesses; and
- whether Lush is relying only on user confirmation.

The first release should use the strongest non-destructive native policy each
harness supports and must not silently pass any "dangerously skip permissions"
flag. Where a harness cannot provide a trustworthy local boundary, Lush should
label the run accordingly and offer managed sandbox mode.

## Managed Sandbox Mode

### Environment lifecycle

The managed executor provisions an environment for a Code session and returns
an opaque environment ID. The initial design should use one isolated environment
per active Code session. Parallel sessions therefore receive independent
filesystems without requiring shared-workspace Git worktrees.

Lifecycle states:

```text
provisioning -> ready -> running -> idle -> destroyed
                  |          |
                  +-- failed-+

optional: idle -> hibernated -> ready
```

The environment must support:

- a pinned runtime image and harness version;
- repository checkout at an explicit commit;
- encrypted credential injection;
- configurable CPU, memory, disk, and wall-clock limits;
- default-deny or policy-controlled network egress;
- process and filesystem containment;
- streaming logs and structured harness events;
- supervised background processes and bounded log retention;
- authenticated preview-port forwarding;
- isolated browser automation and screenshot capture;
- cancellation and hard termination;
- patch and bounded artifact extraction.

Hibernation and filesystem checkpoints are optional executor capabilities.
Harness session resume and durable Lush events must work even when the managed
environment can only remain active or be recreated from repository state.

### Repository access

Managed mode uses organization-managed Git provider credentials or a narrowly
scoped user grant stored in the Lush credential vault. Credentials are injected
ephemerally and are not exposed to the client or persisted in harness events.

The checkout flow resolves a requested ref to a commit and records both. The
harness runs on an isolated branch or detached checkout according to the
provider workflow. Publishing a branch, commit, or pull request is a separate
approved operation.

Git worktrees may be used inside a managed environment later for efficient
parallelism, but that is an executor optimization. The product-level isolation
contract is the managed environment, not a path within it.

### Harness availability and credentials

Harness availability may differ between local and managed modes. Local mode can
use a developer's installed CLI and subscription. Managed mode requires a
license-compatible server installation and a non-interactive credential path.

The harness capability response therefore includes execution-mode availability
and an actionable reason when unavailable. Lush must not imply that a local
subscription login can be transferred into a managed sandbox.

This is a Phase 5 release gate, not a detail to resolve during implementation.
Before a harness is offered in managed mode, Lush must establish:

- an official server-side or delegated authentication mechanism;
- licensing and terms compatible with hosted execution;
- a secure refresh, revocation, and audit path;
- who pays for inference and how cost is surfaced; and
- viable unit economics for the expected session duration and concurrency.

Consumer subscription credentials are never assumed portable. If a harness has
no approved managed credential path, it remains local-only. Managed Code may
still offer another harness or a Lush-managed agent backed by organization API
credentials; the UI must present that as a different execution product rather
than implying subscription parity.

## Approvals and Interaction

Code requires a bidirectional session transport. Streaming output alone is
insufficient because harnesses may request:

- command approval;
- file-write approval;
- network or filesystem expansion;
- structured user input;
- plan confirmation; or
- tool-specific elicitation.

The orchestrator assigns every request a stable Lush interaction ID and maps the
response back to the harness-native request. Decisions are scoped to a single
action unless the harness and policy layer both support a broader grant.

Local mode displays the native harness decision and its scope. Managed mode
applies Lush authorization first, managed sandbox policy second, and harness
approval semantics third. A harness cannot expand the sandbox beyond the
managed policy even if the user approves the request in the UI.

### Autonomy modes

Autonomy is a first-class session setting shown beside the composer. It is
separate from execution target, harness, model, and reasoning effort.

| Lush mode | Intended behavior |
| --- | --- |
| Plan | Inspect and propose a plan without modifying the workspace. |
| Manual | Ask before mutations and side-effecting commands. |
| Accept edits | Permit workspace edits; continue asking for commands, network, and scope expansion. |
| Auto | Proceed within the declared workspace and environment policy; ask before expansion. |
| Bypass permissions | Disable harness confirmation where supported; never bypass the managed sandbox boundary. |

These are product intents, not claims that every harness has identical native
semantics. Each adapter maps the requested mode to an effective harness policy
and returns that resolved policy for display before the run starts. If an exact
mapping is unavailable, Lush shows the narrower fallback and requires the user
to accept it rather than silently broadening permissions.

The initial selection resolves from organization policy, then the user's saved
preference, then the adapter's safe default. The control distinguishes an
explicit choice from an inherited default, for example `Auto - Default`, and
never defaults to `Bypass permissions`.

`Bypass permissions` is an advanced local-only control by default. Enabling it
requires an explicit warning and may be prohibited by organization policy.
Managed mode may expose the label only when it means bypassing redundant
harness prompts inside an already constrained sandbox; it never expands
filesystem, network, secret, or process policy.

Autonomy mode is persisted with the session, can be changed between turns, and
is recorded on every turn for audit and replay. The active mode remains visible
while the harness is working.

## Lush Tools and MCP

The coding harness keeps its native code tools. `services/tools` should expose
organization-scoped integrations, such as issue trackers or internal APIs, to
compatible harnesses through MCP or an adapter-specific bridge.

The session-context principal must propagate into every Lush tool call. The
tools service remains responsible for authorization, redaction, audit logging,
timeouts, and credential isolation. Harness authentication and Lush tool
authentication are separate concerns.

## Client Experience

### Desktop

The desktop Code experience has three primary states.

#### Code home

The home state provides a fast `New session` action, recent sessions, active
background work, and artifacts. It can later include usage summaries such as
session count, active days, tokens, and model distribution once normalized
usage events are reliable across harnesses.

Usage must show source and coverage. Harness-reported tokens, subscription
usage, API cost, and estimated usage are not interchangeable. Lush should not
produce false cross-harness comparisons or make usage analytics block the first
functional release.

#### New-session composer

Session setup happens inline around the composer rather than in a multi-step
wizard. The configuration rail directly above the prompt contains compact
controls for:

- execution target, with connection status and target settings;
- recent repository or `Open folder` selection;
- searchable base branch;
- default-on worktree toggle;
- additional workspace roots;
- harness;
- model or harness mode;
- service tier or speed mode when exposed;
- reasoning effort; and
- autonomy mode.

The prompt remains the visual focus. Secondary controls stay compact and use
menus instead of permanently consuming vertical space. Tooltips describe icon
actions such as adding another folder. The send button alone appears disabled
when the draft has no prompt; the composer and setup controls remain visibly
interactive.

Changing one field revalidates dependent fields without clearing unrelated
choices. For example, changing Local to Managed may invalidate a local folder
and installed harness but should retain prompt text, requested autonomy, and a
compatible model preference.

The session, branch, worktree, and native harness thread are created lazily and
atomically on first send. Until then the screen is a recoverable session draft.

#### Active session

Once execution starts, the configuration rail becomes a compact status header
showing:

- execution target and health;
- repository, worktree, branch, and dirty state;
- harness and harness version;
- model, service tier, and reasoning effort;
- requested and effective autonomy mode; and
- effective sandbox and approval policy.

The main surface includes:

- session transcript and streaming reasoning summaries;
- commands and tool calls with live output;
- approval and user-input requests inline with the turn;
- file-change summary and unified diff;
- validation results;
- stop, steer, and follow-up controls according to capabilities; and
- explicit actions to open the worktree in a terminal or editor.

Configuration that is safe to change between turns remains editable in place.
Changes that require a new native session, workspace, or environment use an
explicit fork/new-session flow rather than mutating provenance invisibly.

#### Navigation

The sidebar prioritizes New session, recents, active work, and artifacts. Recent
session labels should include enough repository and status context to
disambiguate similar tasks while preserving the existing compact session-list
pattern. Filters may narrow by repository, harness, execution target, status,
and date.

### Hosted web

The hosted web app omits the Local option completely. It does not show disabled
local-path controls or ask users to install a CLI on the browser machine. It
offers managed repositories, managed harnesses, and sandbox status only.

### Capability presentation

Harness differences should remain understandable without dominating the UI.
Common controls use common placement. Harness-specific functionality appears in
contextual menus or status panels, and unsupported functionality is omitted or
explained at the point where it matters.

### Design reference observations

The Claude Desktop Code reference validates several interaction patterns worth
adopting:

- environment, repository, branch, and worktree are independent compact
  preflight controls;
- recent repositories and `Open folder` make local onboarding immediate;
- the worktree decision is visible before the first prompt;
- branch selection is searchable and remains near repository context;
- additional folders are a first-class action rather than an attachment
  workaround;
- autonomy mode is always visible and quickly switchable; and
- model and effort remain legible without competing with the prompt.

Lush should preserve these workflow strengths without copying harness-specific
assumptions. It must add explicit harness selection, requested-versus-effective
policy, managed sandbox identity, multi-harness session provenance, and a clear
distinction between user-managed remote targets and Lush-managed environments.

## API Shape

The target-neutral orchestration API should include operations equivalent to:

```text
listExecutionTargets(clientKind)
listHarnesses(executionMode)
listRepositories(executionMode)
listRecentRepositories(executionTargetId)
listRepositoryBranches(repository)
validateSessionDraft(draft)
startCodeSession(draft, initialInput)
createWorkspace(repository, executionMode, baseRef, roots)
listWorktrees(repository)
createWorktree(repository, baseCommit, displayName)
removeWorktree(worktreeId, disposition)
resumeHarnessSession(sessionBinding)
sendHarnessInput(sessionId, input)
updateSessionAutonomy(sessionId, autonomyMode)
respondToHarnessInteraction(interactionId, response)
interruptHarnessTurn(sessionId, turnId)
subscribeToHarnessEvents(sessionId, cursor)
```

Local implementations use the sidecar and local state store. Managed
implementations use authenticated service APIs. Request and event types remain
the same, but executor-specific fields stay behind opaque handles.

Event subscription must support reconnect with a cursor. The client should be
able to recover a completed turn after a window reload without replaying the
harness process itself.

## Adapter Conformance

Each adapter runs the same contract suite against recorded fixtures and a fake
process/server. CI must not require paid inference calls.

Required conformance cases:

1. reports missing, incompatible, and installed versions;
2. negotiates or detects the expected transport protocol and capabilities;
3. starts with the exact requested working directory;
4. emits and persists an external session ID;
5. streams assistant text without duplication;
6. represents reasoning without exposing unsupported hidden content;
7. maps command, tool, file-change, diff, approval, and usage events into their
   concrete canonical schemas;
8. maps terminal success and failure;
9. cancels a running turn and child processes;
10. resumes the correct native session across every supported version pair;
11. blocks resume for incompatible or unknown versions without corrupting the
    native session;
12. survives unknown additive native events;
13. keeps raw persistence disabled by default and redacts before diagnostic
    writes;
14. maps requested autonomy to a non-broader effective harness policy;
15. handles supported additional workspace roots without widening access;
16. produces equivalent canonical events through ACP and direct transports for
    shared fixture scenarios; and
17. declares capability differences accurately.

Optional live smoke tests run only when explicitly enabled and authenticated.
They use a temporary Git repository, a bounded prompt, and a cost ceiling where
the harness supports one.

The abstraction is considered validated when Codex, Claude Code, OpenCode, Pi,
and Amp pass the baseline suite without adding harness-specific concepts to the
core session, workspace, or event model. New optional capability flags are
acceptable; special cases in shared UI and persistence are a signal to revisit
the boundary.

## Human Review Gates

Agent-generated adapter and UI code is expected. Human review is mandatory for
changes to these concentrated risk areas:

- Tauri-sidecar authentication, capability tokens, and local transport;
- executable discovery and environment-variable inheritance;
- requested-to-effective autonomy and approval mapping;
- filesystem and network scope expansion;
- worktree forced removal and branch deletion;
- raw-event, command-output, artifact, and secret redaction;
- managed credential injection and revocation; and
- compatibility changes that could resume or mutate an existing native
  harness session.

Humans also curate the fixture corpus: representative scenarios, expected
canonical meaning, and checks against fixtures that pass while omitting an
important behavior. Agents can capture and update fixtures, but they should not
unilaterally decide what constitutes adequate protocol coverage.

Those reviews should be adversarial and test-backed. Passing generated code is
not enough when a 95 percent correct implementation could delete work or widen
authority.

## Delivery Plan

### Phase 0: Contract and fixtures

- Define the concrete canonical event schemas, capability model, interaction
  contract, size limits, redaction rules, and unknown-event behavior.
- Implement the ACP client baseline and publish the ACP gap matrix.
- Capture sanitized native and ACP fixtures plus expected canonical streams for
  Codex, Claude Code, and OpenCode.
- Build the adapter conformance harness before live integration.
- Define supported version ranges, binding metadata, and resume compatibility
  behavior.
- Add scheduled latest-release drift detection that opens a maintenance report
  or agent-generated patch for human review.

Exit criterion: fake adapters and fixture replays drive one complete Code turn
through the normalized event stream, ACP-versus-direct equivalence is measured,
and a simulated breaking harness release fails closed.

### Phase 1: Local executor and worktrees

- Build the on-demand local agent sidecar.
- Implement authenticated Tauri-to-sidecar transport.
- Implement executable discovery and version probing.
- Implement recent-repository, folder-picker, and searchable branch discovery.
- Implement repository inspection, managed worktree create/list/reconcile, and
  safe removal.
- Implement session-draft validation, lazy first-send provisioning, and
  additional-root policy.
- Add a local-only metadata store and repository mutation locks.
- Add process supervision, environment inspection, bounded logs, and local
  preview-port discovery.
- Complete human security review of local transport, executable discovery, and
  destructive worktree operations.

Exit criterion: the desktop app can select a repository, create a managed
worktree on first send, and show its exact branch/base/dirty state without
creating resources while the session remains a draft.

### Phase 2: First three adapters

- Integrate Codex, Claude Code, and OpenCode through conformant ACP adapters
  where available.
- Add direct transports only for gaps demonstrated by the Phase 0 matrix:
  `codex app-server`, the Claude Agent SDK or bidirectional stream JSON, and
  the OpenCode headless server or CLI JSON mode.
- Persist Lush session bindings and normalized events.
- Implement cancellation and the supported approval flows.
- Run minimum/current/latest version fixtures and cross-version resume tests.

Exit criterion: each harness can complete and resume a multi-turn change in a
temporary repository through the same orchestration API.

### Phase 3: Desktop Code experience

- Replace the `/code` placeholder with repository/worktree onboarding.
- Add the inline preflight composer with target, repository, branch, worktree,
  additional roots, harness, model, service tier, effort, and autonomy controls.
- Reuse the existing AI Elements message, reasoning, tool, and artifact
  components.
- Add command output, approval, file-change, diff review, and validation UI.
- Add open-in-terminal/editor and retain/archive/remove-worktree actions.

Exit criterion: implement a real Lush change using Lush Code with Codex, then
repeat with Claude Code and OpenCode.

### Phase 4: Pi and Amp validation

- Implement Pi RPC/SDK and Amp SDK adapters, preferring conformant ACP adapters
  when available.
- Run the full conformance and drift suite.
- Refactor the shared contract only when a concept is genuinely common or a
  capability distinction is required.

Exit criterion: all five adapters pass baseline conformance without
harness-specific branches in shared persistence or primary Code UI components.

### Phase 5: Managed sandbox executor

- Publish the per-harness managed credential, licensing, and unit-economics
  matrix and make an explicit go/no-go decision for each harness.
- Select the sandbox provider and define the environment runtime contract.
- Build repository credential and checkout workflows.
- Package pinned harness versions in managed runtime images.
- Add policy-controlled egress, resource limits, and bounded artifact
  extraction.
- Add process supervision, authenticated preview URLs, isolated browser
  automation, and hard termination.
- Expose the same orchestration API to desktop and hosted web clients.

Exit criterion: a session using an approved managed credential path starts in
the hosted web app, completes in a managed sandbox, and resumes from the desktop
app. Hibernation and checkpoint restore are not required for this exit.

### Phase 6: Hardening

- Crash recovery and orphan-process cleanup.
- Sidecar upgrade compatibility and protocol negotiation.
- Worktree recovery and branch publication flows.
- Managed environment quotas and cost controls.
- Optional managed hibernation and checkpoint/restore for executors that
  support it.
- OpenTelemetry spans, audit events, and support bundles.
- Performance budgets for cold start, event latency, memory, and long-session
  rendering.
- Provenance-aware usage and model analytics across harnesses.

## Initial Decisions

- Lush orchestrates existing harnesses; it does not implement a new coding
  agent loop.
- Desktop supports Local and Managed modes; hosted web supports Managed only.
- Lush-managed Git worktrees are the default local concurrency unit.
- Worktree creation is lazy on first send and can be explicitly disabled for a
  local session.
- New Code sessions use an inline preflight composer rather than a setup wizard.
- Worktrees are not treated as security sandboxes.
- The first adapters are Codex, Claude Code, and OpenCode.
- Pi and Amp are required before declaring the adapter contract stable.
- ACP is the preferred harness transport where it passes Lush conformance;
  direct adapters fill measured gaps rather than defining a parallel standard.
- Structured programmatic interfaces are required; formatted TUI scraping is
  out of scope.
- Native harness sessions remain the execution-context source of truth.
- Local absolute paths and harness credentials remain local.
- Harness-native code tools remain native; Lush organization tools enter
  through `services/tools` and MCP or an equivalent bridge.
- Harness adapters and execution environments are separate contracts.
- Both execution modes should provide a complete inspect, implement, run,
  observe, validate, and deliver loop rather than only shell access.
- Autonomy is a visible, audited session setting distinct from harness, model,
  reasoning effort, and execution target.
- Multi-root workspaces are explicit; additional roots default to read-only.
- Canonical events have concrete schemas; raw payload persistence is off by
  default.
- Harness drift detection and resume compatibility are Phase 0/2 concerns.
- Managed harness availability is gated on official credentials, licensing,
  security, and viable economics.

## Open Decisions

1. Which managed sandbox provider and persistence model best meet startup,
   isolation, hibernation, and cost requirements?
2. Should the local sidecar be a Bun standalone executable, a small Rust host
   with adapter subprocesses, or a hybrid after the first performance spike?
3. Which local metadata store should own workspace and worktree records?
4. Which approval semantics are baseline product requirements versus optional
   harness capabilities?
5. Should one Lush Code session map permanently to one worktree, or may a user
   explicitly rebind it after branch publication?
6. Which measured ACP gaps justify retaining a direct adapter for each harness?
7. How should branch publication, pull requests, and merge completion affect
   worktree retention?
8. Should SSH and remote-control targets enter immediately after local mode or
   wait until managed sandbox execution is complete?
9. Which session-draft fields persist across app restarts, and which remain
   ephemeral until first send?
10. How should secondary writable repositories participate in branch,
    worktree, and publication workflows?

These decisions should be resolved through the first Codex local-mode spike and
the managed sandbox proof rather than through UI-only prototyping.

## Upstream References

- [Agent Client Protocol specification and SDKs](https://github.com/agentclientprotocol/agent-client-protocol)
- [Agent Client Protocol updates](https://agentclientprotocol.com/updates)
- [Codex app-server protocol](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- [Claude Code CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-usage)
- [OpenCode server API](https://opencode.ai/docs/server/)
- [OpenCode structured run implementation](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/cli/cmd/run.ts)
- [Pi coding-agent programmatic interfaces](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md)
- [Pi RPC protocol](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/rpc.md)
- [Amp SDK](https://ampcode.com/manual/sdk)
- [Amp streaming JSON protocol](https://ampcode.com/manual/appendix)
