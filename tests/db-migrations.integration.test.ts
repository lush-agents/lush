import { expect, test } from "bun:test";
import { createIsolatedTestDatabase } from "../packages/db/src/test";
import { sessionIpColumns } from "../packages/db/src/migrations/009_session_ip_columns";
import { integrationDatabaseUrl } from "./integration-database";

const databaseUrl = integrationDatabaseUrl();

if (!databaseUrl) {
  test.skip("migration idempotency requires a test database URL", () => {});
} else {
  test("session IP columns converge after the interim migration 008 schema", async () => {
    const harness = await createIsolatedTestDatabase(databaseUrl);

    try {
      await sessionIpColumns.up(harness.db);
      const sessions = await harness.db
        .selectFrom("sessions")
        .select([
          "ipValue",
          "ipMode",
          "lastSeenIpValue",
          "lastSeenIpMode"
        ])
        .execute();

      expect(sessions).toEqual([]);
    } finally {
      await harness.destroy();
    }
  });
}
