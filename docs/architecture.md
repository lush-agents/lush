# Lush Architecture

Lush is an open application layer and control plane for multi-model AI agents.
It provides a familiar chat, code, work, and agent-building experience on top
of interchangeable inference providers, tool systems, and agent runtimes.
The first-party client targets UX parity with the best-in-class AI frontends:
streaming must remain readable and interruptible, agent activity must be
inspectable, and rich outputs must remain portable across providers.

The repository is a Bun workspace monorepo that separates product apps,
backend services, and shared packages.

## Workspace Layout

**`apps/lush`.** The first-party Lush app. This is the shared React and
Tailwind client that will contain chat, code, work, agents, settings, and admin
surfaces. It is intended to ship to web, desktop, iOS, and Android through
Tauri packaging rather than separate app workspaces per platform.

The client uses React Router's data-router APIs for nested public, authenticated,
organization-scoped, settings, and workspace routes. A context-backed application
controller coordinates session refresh and domain mutations, while route modules
own page state and composition. Heavy chat and organization settings surfaces are
split into lazy chunks; shadcn primitives remain local source under
`apps/lush/src/components/ui`.

Agent-facing composition uses the official AI Elements registry on top of
shadcn/ui. The product owns the typed agent event and persisted message-part
contracts; UI components render those contracts without making the backend
dependent on a specific frontend SDK or inference gateway.

**`services/*`.** Deployable backend services and control-plane boundaries.
Services own durable state or external side effects for one concern and
communicate through the API surface and event stream.

**`packages/*`.** Shared domain packages that are not independently deployed.
These packages hold reusable control-plane concepts such as memory and skills.

## Services

**API (`services/api`).** Single front door for first-party clients and
external integrations. It authenticates requests, enforces cross-cutting request
policy, and routes work to the appropriate backend service.

**Authn/z (`services/authz`).** Identity, organization, role, and runtime
access-control service. It owns authorization decisions that other services
enforce.

**Configuration (`services/configuration`).** Authoritative backend for
settings, admin controls, environments, connectors, governance configuration,
and provider/model setup. The settings UI lives inside `apps/lush`; this
service owns the state behind that UI.

**Sessions (`services/sessions`).** Durable sessions, conversation messages,
and active work contexts. It owns conversational state that must be shared
across clients and collaboration channels.

**Events (`services/events`).** Durable append-only event log for system
activity. It feeds audit trails, usage reporting, and operational workflows.

**Scheduler (`services/scheduler`).** Durable scheduling for deferred actions,
recurring loops, reminders, retry/backoff timers, and agent wakeups. It emits
due work back into the control plane rather than owning execution itself.

**Agent (`services/agent`).** Interface to agent sandboxes and execution
contexts. Backends may include hosted isolation such as gVisor or Kata and a
local subprocess mode for development.

**Inference (`services/inference`).** Model routing boundary for inference
providers. It owns provider selection, failover policy, pinning, and request
mediation.

**Tools (`services/tools`).** Mediated access layer for MCP, OpenAPI, and other
tool integrations. Models receive scoped capabilities rather than raw URLs or
credentials.

**Skills (`services/skills`).** Runtime service for publishing, indexing,
resolving, and loading agent skills. It owns service workflows while
`packages/skill-catalog` keeps shared skill metadata and catalog primitives.

**Artifacts (`services/artifacts`).** Files, uploads, generated assets, code
outputs, and other durable work products. It owns metadata, storage references,
access controls, and lifecycle policy hooks.

**Notifications (`services/notifications`).** Outbound notifications for
email, push, in-app alerts, and channel delivery requests. Other services can
use this boundary instead of duplicating notification policy.

**Team Chat (`services/team-chat`).** Service for exposing Lush workflows
inside team chat platforms such as Slack, Microsoft Teams, and Discord.
Platform-specific adapters live inside this service behind a shared team-chat
interface.

## Shared Packages

**Skill Catalog (`packages/skill-catalog`).** Shared package for skill metadata
and catalog primitives used by `services/skills` and agent runtimes.

**Memory (`packages/memory`).** Portable memory boundary for relational, graph,
and vector-backed stores. It keeps observed facts separate from derived
memories and applies scoped ACLs.
