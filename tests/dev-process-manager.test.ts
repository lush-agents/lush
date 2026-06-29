import { expect, test } from "bun:test";
import type { ProcessManagerConfig } from "../scripts/dev/process-manager";
import {
  interpolateEnv,
  resolveCommandEnv,
  sanitizeLogName
} from "../scripts/dev/process-manager";

test("dev config lists the expected local services", async () => {
  const config = (await Bun.file("scripts/dev/config.json").json()) as ProcessManagerConfig;

  expect(config.logDir).toBe("logs");
  expect(config.dockerDependencies?.map((dependency) => dependency.name)).toEqual([
    "db"
  ]);
  expect(config.tasks?.map((task) => task.name)).toEqual([
    "codegen",
    "openapi",
    "migrate"
  ]);
  expect(config.processes.map((process) => process.name)).toEqual([
    "api",
    "app",
    "docs"
  ]);
  expect(config.processes.find((process) => process.name === "docs")?.color).toBe(
    "blue"
  );
});

test("interpolateEnv resolves required values and defaults", () => {
  expect(
    interpolateEnv("http://${HOST}:${PORT:-7330}", {
      HOST: "127.0.0.1"
    })
  ).toBe("http://127.0.0.1:7330");

  expect(() => interpolateEnv("${DATABASE_URL}", {})).toThrow(
    "DATABASE_URL is required"
  );
});

test("resolveCommandEnv resolves each configured environment value", () => {
  expect(
    resolveCommandEnv(
      {
        DATABASE_URL: "${DATABASE_URL}",
        LUSH_AUTH_PASSWORD_ENABLED: "${LUSH_AUTH_PASSWORD_ENABLED:-true}"
      },
      {
        DATABASE_URL: "postgres://lush:lush@127.0.0.1:5432/lush"
      }
    )
  ).toEqual({
    DATABASE_URL: "postgres://lush:lush@127.0.0.1:5432/lush",
    LUSH_AUTH_PASSWORD_ENABLED: "true"
  });
});

test("sanitizeLogName keeps service logs under predictable filenames", () => {
  expect(sanitizeLogName("api")).toBe("api");
  expect(sanitizeLogName("../db service")).toBe(".._db_service");
});
