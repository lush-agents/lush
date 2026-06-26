## Lush, the open control plane for multi-model AI

Open source AI application layer and control plane that provides the same
end-user experience as claude or codex, on top of any inference backend.

**Application client (Web/Desktop/Mobile).** App that feels instantly familiar
for anyone who has used claude desktop or codex. Chat, code, scheduler, agent
builder.

**Settings (Connections & Governance).** Access, connectors, inference
providers, models, usage and cost visibility, audit.

**API Gateway.** Single front door for all clients and channels. Thin, routes
to the service gateways.

**Authn/z.** Identity, org/role model, and the ACLs that are enforced at
runtime. Extensible via plugins and hooks.

**Events.** Durable append-only log of system events, feeds audits and
chargebacks..

**Agent Gateway.** Interface to agent sandboxes. Backends are gVisor/Kata via
agent-sandbox, and local subprocess for devopment.

**Inference Gateway.** Model routing, failover policy, pinning across
inference providers.

**Tool Gateway.** Mediated tool access (MCP/OpenAPI) where the model never
sees raw URLs or creds.

**Skill Catalog.** Agent skills, searchable and loaded on demand.

**Memory.** Portable multi-index memory store (relational, graph, vector) with
strict separation between observed facts and derived memories. Provides search
and scoped ACLs.

**Collaboration Adapters.** Provides the lush agent runtime natively through
Slack, Teams, Discord, etc.
