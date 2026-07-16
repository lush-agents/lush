import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("web runtime configuration", () => {
  test("writes the public API URL into JavaScript configuration", async () => {
    const result = await generateRuntimeConfig("https://api.example.com/v1");

    expect(result.exitCode).toBe(0);
    expect(result.contents).toBe(
      'window.__LUSH_CONFIG__ = Object.freeze({"apiBaseUrl":atob("aHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20vdjE=")});\n'
    );
  });

  test("keeps same-origin mode when the public API URL is empty", async () => {
    const result = await generateRuntimeConfig("");

    expect(result.exitCode).toBe(0);
    expect(result.contents).toContain('"apiBaseUrl":atob("")');
  });

  test("rejects unsafe or non-HTTP API URLs", async () => {
    expect((await generateRuntimeConfig("javascript:alert(1)")).exitCode).toBe(1);
    expect(
      (await generateRuntimeConfig('https://api.example.com/";alert(1)//')).exitCode
    ).toBe(1);
  });
});

async function generateRuntimeConfig(apiUrl: string) {
  const directory = await mkdtemp(path.join(tmpdir(), "lush-runtime-config-"));
  temporaryDirectories.push(directory);
  const outputPath = path.join(directory, "runtime-config.js");
  const process = Bun.spawn(
    ["sh", "containers/web/05-lush-runtime-config.sh"],
    {
      env: {
        ...Bun.env,
        LUSH_API_URL: apiUrl,
        LUSH_RUNTIME_CONFIG_PATH: outputPath
      },
      stdout: "ignore",
      stderr: "ignore"
    }
  );
  const exitCode = await process.exited;

  return {
    exitCode,
    contents: exitCode === 0 ? await readFile(outputPath, "utf8") : undefined
  };
}
