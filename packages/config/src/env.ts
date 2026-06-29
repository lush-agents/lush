import { z } from "zod";

export type EnvSource = Record<string, string | undefined>;

declare const process: {
  env: EnvSource;
};

export class ConfigError extends Error {
  constructor(
    message: string,
    readonly details: {
      missing?: readonly string[];
      invalid?: readonly string[];
    } = {}
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

export { z };

export function currentEnv() {
  return process.env;
}

const envStringSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed || undefined;
  },
  z.string().min(1)
);

const optionalEnvStringSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed || undefined;
  },
  z.string().optional()
);

export const envSchema = {
  string: () => envStringSchema,
  optionalString: (fallback: string) =>
    optionalEnvStringSchema.transform((value) => value ?? fallback),
  number: (fallback: number) =>
    optionalEnvStringSchema.transform((value, ctx) => {
      if (!value) {
        return fallback;
      }

      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        ctx.addIssue({
          code: "custom",
          message: "expected a number"
        });
        return z.NEVER;
      }

      return parsed;
    }),
  boolean: (fallback: boolean) =>
    optionalEnvStringSchema.transform((value, ctx) => {
      if (!value) {
        return fallback;
      }

      if (value === "true") {
        return true;
      }
      if (value === "false") {
        return false;
      }

      ctx.addIssue({
        code: "custom",
        message: "expected true or false"
      });
      return z.NEVER;
    }),
  commaList: () =>
    optionalEnvStringSchema.transform((value) =>
      value
        ? value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : []
    )
};

export function readEnvSchema<const Shape extends z.ZodRawShape>(
  shape: Shape,
  env: EnvSource = process.env
) {
  const result = z.object(shape).safeParse(env);
  if (result.success) {
    return result.data;
  }

  throw configErrorFromZod(result.error);
}

export function requiredEnv<const Names extends readonly string[]>(
  names: Names,
  env: EnvSource = process.env
) {
  return readEnvSchema(
    Object.fromEntries(names.map((name) => [name, envSchema.string()])) as {
      [Name in Names[number]]: ReturnType<typeof envSchema.string>;
    },
    env
  );
}

export function requiredEnvValue(
  name: string,
  env: EnvSource = process.env
) {
  return requiredEnv([name], env)[name];
}

export function envValue(
  name: string,
  env: EnvSource = process.env
) {
  return env[name]?.trim() || undefined;
}

export function optionalEnv(
  name: string,
  fallback: string,
  env: EnvSource = process.env
) {
  return readEnvSchema({ [name]: envSchema.optionalString(fallback) }, env)[name];
}

export function optionalNumberEnv(
  name: string,
  fallback: number,
  env: EnvSource = process.env
) {
  return readEnvSchema({ [name]: envSchema.number(fallback) }, env)[name];
}

export function optionalBooleanEnv(
  name: string,
  fallback: boolean,
  env: EnvSource = process.env
) {
  return readEnvSchema({ [name]: envSchema.boolean(fallback) }, env)[name];
}

export function commaListEnv(
  name: string,
  env: EnvSource = process.env
) {
  return readEnvSchema({ [name]: envSchema.commaList() }, env)[name];
}

function configErrorFromZod(error: z.ZodError) {
  const invalid = Array.from(
    new Set(
      error.issues
        .map((issue) => String(issue.path[0] ?? ""))
        .filter(Boolean)
    )
  );

  const missing = invalid.filter((name) =>
    error.issues.some(
      (issue) =>
        String(issue.path[0] ?? "") === name &&
        issue.code === "invalid_type" &&
        "expected" in issue &&
        issue.expected === "string"
    )
  );
  const invalidOnly = invalid.filter((name) => !missing.includes(name));

  if (missing.length > 0 && invalidOnly.length === 0) {
    return new ConfigError(
      `Missing required environment variables: ${missing.join(", ")}`,
      { missing }
    );
  }

  if (missing.length === 0 && invalidOnly.length > 0) {
    return new ConfigError(
      `Invalid environment variables: ${invalidOnly.join(", ")}`,
      { invalid: invalidOnly }
    );
  }

  return new ConfigError(
    [
      missing.length > 0
        ? `missing: ${missing.join(", ")}`
        : undefined,
      invalidOnly.length > 0
        ? `invalid: ${invalidOnly.join(", ")}`
        : undefined
    ]
      .filter(Boolean)
      .join("; ")
      .replace(/^/, "Invalid environment configuration: "),
    { missing, invalid: invalidOnly }
  );
}
