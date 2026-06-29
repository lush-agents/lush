# DB

Shared PostgreSQL/Kysely package for service-owned tables.

## Local Development

```sh
docker compose up -d lush-postgres
bun run db:migrate
```

The default local connection string is:

```sh
postgres://lush:lush@127.0.0.1:5432/lush
```

Services read `DATABASE_URL` by default. Service-specific database URL overrides
can be added when isolation or scaling requires them.

## Migrations

Migrations are one file each under `src/migrations`.

To add a migration:

1. Create a numbered file such as `002_add_threads.ts`.
2. Export a `Migration` object with a stable `id`.
3. Register it in `src/migrations/index.ts` after the previous migration.

The runner records applied ids in `lush_migrations` and applies pending
migrations in registry order.
