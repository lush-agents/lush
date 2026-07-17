import { describe, expect, test } from "bun:test";
import { integrationDatabaseUrl } from "./integration-database";

describe("integration test database configuration", () => {
  test("uses the dedicated test database URL", () => {
    expect(
      integrationDatabaseUrl({
        CI: "true",
        DATABASE_URL: "postgres://unsafe-fallback",
        LUSH_TEST_DATABASE_URL: " postgres://dedicated-test "
      })
    ).toBe("postgres://dedicated-test");
  });

  test("allows the normal database fallback outside CI", () => {
    expect(
      integrationDatabaseUrl({ DATABASE_URL: " postgres://local-test " })
    ).toBe("postgres://local-test");
  });

  test("allows local runs to skip when no database is configured", () => {
    expect(integrationDatabaseUrl({})).toBeUndefined();
  });

  test("fails CI instead of silently skipping integration coverage", () => {
    expect(() => integrationDatabaseUrl({ CI: "true" })).toThrow(
      "LUSH_TEST_DATABASE_URL is required in CI"
    );
  });
});
