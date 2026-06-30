import { expect, test } from "bun:test";

const generatedPaths = [
  "packages/api-client/src/generated.ts",
  "services/docs/generated/openapi",
  "services/docs/content/docs/services"
];

async function runCommand(cmd: string[]) {
  const proc = Bun.spawn({
    cmd,
    stdout: "pipe",
    stderr: "pipe"
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);

  if (exitCode !== 0) {
    throw new Error(
      `${cmd.join(" ")} exited with ${exitCode}\n\n${stdout}${stderr}`
    );
  }

  return { stdout, stderr };
}

test(
  "generated files are up to date",
  async () => {
    await runCommand(["bun", "run", "api:codegen"]);
    await runCommand(["bun", "run", "api:openapi"]);
    await runCommand(["bun", "run", "--cwd", "services/docs", "services:codegen"]);

    const diff = await runCommand([
      "git",
      "diff",
      "--",
      ...generatedPaths
    ]);
    const untracked = await runCommand([
      "git",
      "ls-files",
      "--others",
      "--exclude-standard",
      "--",
      ...generatedPaths
    ]);
    const output = `${diff.stdout}${diff.stderr}${untracked.stdout}${untracked.stderr}`;

    expect(output).toBe("");
  },
  {
    timeout: 60_000
  }
);
