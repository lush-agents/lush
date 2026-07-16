# Notifications

Outbound notification service for email, push, in-app alerts, and channel
delivery requests. Team chat integrations can consume this boundary rather than
duplicating notification policy.

`src/email.ts` defines the provider-neutral `EmailDelivery` contract plus SMTP
and development log implementations. Auth flows depend only on that contract;
managed deployments can inject a transactional provider without changing auth.
