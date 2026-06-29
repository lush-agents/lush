import { sql } from "kysely";
import { createDb } from "./client";
import { migrations } from "./migrations";

export async function migrateToLatest(db = createDb()) {
  await sql`
    create table if not exists lush_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `.execute(db);

  const appliedRows = await db
    .selectFrom("lushMigrations")
    .select("id")
    .execute();
  const applied = new Set(appliedRows.map((row) => row.id));

  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      continue;
    }

    await db.transaction().execute(async (trx) => {
      await migration.up(trx);
      await sql`insert into lush_migrations (id) values (${migration.id})`.execute(trx);
    });
    console.log(`Applied migration ${migration.id}`);
  }
}

if (import.meta.main) {
  const db = createDb();

  try {
    await migrateToLatest(db);
  } finally {
    await db.destroy();
  }
}
