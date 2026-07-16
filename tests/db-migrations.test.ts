import { expect, test } from "bun:test";
import { migrations } from "../packages/db/src/migrations";

test("database migrations are registered in id order with unique ids", () => {
  const ids = migrations.map((migration) => migration.id);
  const sortedIds = [...ids].sort();

  expect(ids).toEqual(sortedIds);
  expect(new Set(ids).size).toBe(ids.length);
});

test("database migration ids match their ordinal prefix", () => {
  expect(migrations.map((migration) => migration.id)).toEqual([
    "001_auth_and_inference_state",
    "002_session_state",
    "003_session_agent_id",
    "004_projects",
    "005_refresh_token_rotation"
  ]);
});

test("refresh-token rotation migration adds a unique token-family lookup", async () => {
  const migration = await Bun.file(
    "packages/db/src/migrations/005_refresh_token_rotation.ts"
  ).text();

  expect(migration).toContain("add column if not exists refresh_family_hash text");
  expect(migration).toContain("sessions_refresh_family_hash_idx");
  expect(migration).toContain("where refresh_family_hash is not null");
});
