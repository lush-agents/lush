import { test } from "bun:test";

test(
  "repo checks pass",
  async () => {
    const proc = Bun.spawn({
      cmd: ["bun", "run", "test:repo"],
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
        `bun run test:repo exited with ${exitCode}\n\n${stdout}${stderr}`
      );
    }
  },
  {
    timeout: 120_000
  }
);
