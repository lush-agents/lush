# Inference

Model-routing boundary for inference providers. It is responsible for provider
selection, failover policy, pinning, and request mediation.

This service owns the inference API contract and provider integration behavior.
The API gateway imports and exposes the public routes, but provider credentials,
model discovery, and model selection logic live here.

## Provider Configuration

Inference providers are organization-scoped database state. Configure providers
through the API/UI so credentials, model discovery, enabled models, and defaults
belong to the current tenant.
