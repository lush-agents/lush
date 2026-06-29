# Inference

Model-routing boundary for inference providers. It is responsible for provider
selection, failover policy, pinning, and request mediation.

This service owns the inference API contract and provider integration behavior.
The API gateway imports and exposes the public routes, but provider credentials,
model discovery, and model selection logic live here.

## Development Configuration

- `LUSH_INFERENCE_PROVIDER` - `fireworks` or `baseten`; defaults to `fireworks`.
- `LUSH_INFERENCE_ENDPOINT` - override the OpenAI-compatible chat completions URL.
- `LUSH_INFERENCE_MODEL` - model name passed to the provider; defaults to
  `glm-5.2`.
- `LUSH_INFERENCE_API_KEY` - provider API key. `FIREWORKS_API_KEY` and
  `BASETEN_API_KEY` are also checked.

If no API key is configured, the runtime streams a local development fallback
response so the frontend can be exercised without provider credentials.
