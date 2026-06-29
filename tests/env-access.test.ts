import { expect, test } from "bun:test";

const allowedEnvAccessFiles = [
  "apps/lush/src/lib/app-data.ts",
  "packages/config/src/env.ts"
];

test("runtime env access goes through the config boundary", async () => {
  const proc = Bun.spawn({
    cmd: [
      "rg",
      "-l",
      "process\\.env|Bun\\.env|import\\.meta\\.env",
      "apps",
      "packages",
      "services",
      "scripts",
      "--glob",
      "!**/node_modules/**",
      "--glob",
      "!services/docs/generated/**"
    ],
    stdout: "pipe",
    stderr: "pipe"
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);

  if (exitCode > 1) {
    throw new Error(`env access scan failed\n\n${stdout}${stderr}`);
  }

  expect(
    stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .sort()
  ).toEqual(allowedEnvAccessFiles);
});
