import { sql } from "kysely";
import { createDb } from "./client";
import { migrateToLatest } from "./migrate";

export async function createIsolatedTestDatabase(databaseUrl: string) {
  const schemaName = `test_${crypto.randomUUID().replace(/-/g, "")}`;
  const adminDb = createDb({ databaseUrl });
  await sql`create schema ${sql.ref(schemaName)}`.execute(adminDb);

  const schemaUrl = new URL(databaseUrl);
  schemaUrl.searchParams.set("options", `-c search_path=${schemaName}`);
  const db = createDb({ databaseUrl: schemaUrl.toString() });
  await migrateToLatest(db);

  return {
    db,
    async destroy() {
      await db.destroy();
      await sql`drop schema if exists ${sql.ref(schemaName)} cascade`.execute(
        adminDb
      );
      await adminDb.destroy();
    }
  };
}
