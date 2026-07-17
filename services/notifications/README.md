# Notifications

Outbound notification service for email, push, in-app alerts, and channel
delivery requests. Team chat integrations can consume this boundary rather than
duplicating notification policy.

`src/email.ts` defines the provider-neutral `EmailDelivery` contract plus SMTP
and development log implementations. Auth flows depend only on that contract;
managed deployments can add a transactional provider without changing auth.
The stock API selects only `none`, `log`, or `smtp`; a provider HTTP API
requires a new `EmailDelivery` implementation, configuration branch, tests, and
API image. The self-hosting guide documents that extension path.
