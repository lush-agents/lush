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
    "001_auth_and_inference_state"
  ]);
});
