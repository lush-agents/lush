import { describe, expect, test } from "bun:test";
import {
  ConfigError,
  commaListEnv,
  envValue,
  envSchema,
  optionalBooleanEnv,
  optionalEnv,
  optionalNumberEnv,
  requiredEnv,
  requiredEnvValue,
  readEnvSchema
} from "../packages/config/src/env";

describe("config env helpers", () => {
  test("reports all missing required environment variables", () => {
    expect(() =>
      requiredEnv(["DATABASE_URL", "LUSH_SECRET_KEY"], {
        DATABASE_URL: "",
        LUSH_SECRET_KEY: undefined
      })
    ).toThrow("Missing required environment variables: DATABASE_URL, LUSH_SECRET_KEY");
  });

  test("returns trimmed required values", () => {
    expect(requiredEnv(["DATABASE_URL"], { DATABASE_URL: " postgres://db " }))
      .toEqual({ DATABASE_URL: "postgres://db" });
  });

  test("returns a single required value", () => {
    expect(requiredEnvValue("LUSH_SECRET_KEY", { LUSH_SECRET_KEY: " secret " }))
      .toBe("secret");
  });

  test("returns undefined for blank optional values", () => {
    expect(envValue("LUSH_API_HOST", { LUSH_API_HOST: "   " })).toBeUndefined();
  });

  test("uses optional string fallbacks", () => {
    expect(optionalEnv("LUSH_API_HOST", "0.0.0.0", {})).toBe("0.0.0.0");
    expect(optionalEnv("LUSH_API_HOST", "0.0.0.0", {
      LUSH_API_HOST: " 127.0.0.1 "
    })).toBe("127.0.0.1");
  });

  test("parses comma separated lists", () => {
    expect(commaListEnv("LUSH_APP_ORIGIN", {
      LUSH_APP_ORIGIN: " http://localhost:5874, , http://127.0.0.1:5874 "
    })).toEqual(["http://localhost:5874", "http://127.0.0.1:5874"]);
  });

  test("rejects invalid numbers", () => {
    expect(() => optionalNumberEnv("LUSH_API_PORT", 7330, {
      LUSH_API_PORT: "nope"
    })).toThrow(ConfigError);
  });

  test("parses optional booleans", () => {
    expect(optionalBooleanEnv("LUSH_AUTH_PASSWORD_ENABLED", true, {})).toBe(true);
    expect(optionalBooleanEnv("LUSH_AUTH_PASSWORD_ENABLED", true, {
      LUSH_AUTH_PASSWORD_ENABLED: "false"
    })).toBe(false);
  });

  test("rejects invalid booleans", () => {
    expect(() => optionalBooleanEnv("LUSH_AUTH_PASSWORD_ENABLED", true, {
      LUSH_AUTH_PASSWORD_ENABLED: "0"
    })).toThrow(ConfigError);
  });

  test("parses object-shaped env schemas", () => {
    expect(
      readEnvSchema(
        {
          LUSH_API_PORT: envSchema.number(7330),
          LUSH_API_HOST: envSchema.optionalString("0.0.0.0"),
          LUSH_APP_ORIGIN: envSchema.commaList()
        },
        {
          LUSH_API_PORT: " 5874 ",
          LUSH_APP_ORIGIN: "http://localhost:5874,http://127.0.0.1:5874"
        }
      )
    ).toEqual({
      LUSH_API_PORT: 5874,
      LUSH_API_HOST: "0.0.0.0",
      LUSH_APP_ORIGIN: ["http://localhost:5874", "http://127.0.0.1:5874"]
    });
  });

  test("rejects invalid object-shaped env schemas", () => {
    expect(() =>
      readEnvSchema(
        {
          DATABASE_URL: envSchema.string(),
          LUSH_API_PORT: envSchema.number(7330)
        },
        { LUSH_API_PORT: "nope" }
      )
    ).toThrow(ConfigError);
  });
});
