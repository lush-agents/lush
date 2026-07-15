import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnJsonLineProcess } from "../services/agent/src/code/process";

test("interrupt terminates the harness process group", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "lush-code-process-"));
  const pidFile = path.join(directory, "child.pid");
  const startedAt = Date.now();
  const running = spawnJsonLineProcess({
    command: ["/bin/sh", "-c", `sleep 30 & echo $! > ${pidFile}; wait`],
    cwd: directory,
    handlers: { stdout() {}, stderr() {} }
  });

  try {
    await Bun.sleep(100);
    running.interrupt();
    await running.exited;
    expect(Date.now() - startedAt).toBeLessThan(6_000);
    const childPid = Number((await readFile(pidFile, "utf8")).trim());
    expect(() => process.kill(childPid, 0)).toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
