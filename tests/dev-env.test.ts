import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  ensureDevEnvFile,
  fillDevEnvTemplate
} from "../scripts/dev/env";

describe("dev env generation", () => {
  test("fills generated secret placeholders with dotenv-safe values", () => {
    const contents = fillDevEnvTemplate(
      [
        "LUSH_SECRET_KEY=__GENERATED_LUSH_SECRET_KEY__",
        "LUSH_AUTH_JWT_PRIVATE_KEY=__GENERATED_LUSH_AUTH_JWT_PRIVATE_KEY__",
        "LUSH_AUTH_JWT_PUBLIC_KEY=__GENERATED_LUSH_AUTH_JWT_PUBLIC_KEY__"
      ].join("\n"),
      {
        secretKey: "abc123",
        privateKeyPem: "-----BEGIN PRIVATE KEY-----\nprivate\n-----END PRIVATE KEY-----",
        publicKeyPem: "-----BEGIN PUBLIC KEY-----\npublic\n-----END PUBLIC KEY-----"
      }
    );

    expect(contents).toContain('LUSH_SECRET_KEY="abc123"');
    expect(contents).toContain(
      'LUSH_AUTH_JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nprivate\\n-----END PRIVATE KEY-----"'
    );
    expect(contents).toContain(
      'LUSH_AUTH_JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\\npublic\\n-----END PUBLIC KEY-----"'
    );
  });

  test("creates a dev env file once from a template", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "lush-dev-env-"));
    const envPath = path.join(directory, ".env.development");
    const templatePath = path.join(directory, ".env.template");

    await Bun.write(
      templatePath,
      [
        "DATABASE_URL=postgres://lush:lush@127.0.0.1:5432/lush",
        "LUSH_SECRET_KEY=__GENERATED_LUSH_SECRET_KEY__",
        "LUSH_AUTH_JWT_PRIVATE_KEY=__GENERATED_LUSH_AUTH_JWT_PRIVATE_KEY__",
        "LUSH_AUTH_JWT_PUBLIC_KEY=__GENERATED_LUSH_AUTH_JWT_PUBLIC_KEY__"
      ].join("\n")
    );

    const created = await ensureDevEnvFile({ envPath, templatePath });
    const firstContents = await Bun.file(envPath).text();
    const skipped = await ensureDevEnvFile({ envPath, templatePath });

    expect(created.created).toBe(true);
    expect(skipped.created).toBe(false);
    expect(await Bun.file(envPath).text()).toBe(firstContents);
    expect(firstContents).toContain("-----BEGIN PRIVATE KEY-----");
    expect(firstContents).not.toContain("__GENERATED_");
  });
});
