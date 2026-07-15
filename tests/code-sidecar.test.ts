import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startCodeSidecar } from "../services/agent/src/code/server";

test("local Code sidecar requires its per-launch capability token", async () => {
  const stateDirectory = await mkdtemp(path.join(tmpdir(), "lush-code-state-"));
  const token = "a".repeat(64);
  const server = startCodeSidecar({ token, stateDirectory });
  const baseUrl = `http://${server.hostname}:${server.port}`;

  try {
    const unauthorized = await fetch(`${baseUrl}/v1/sessions`);
    expect(unauthorized.status).toBe(401);

    const authorized = await fetch(`${baseUrl}/v1/sessions`, {
      headers: { authorization: `Bearer ${token}` }
    });
    expect(authorized.status).toBe(200);
    expect(await authorized.json()).toEqual([]);
  } finally {
    server.stop(true);
    await rm(stateDirectory, { recursive: true, force: true });
  }
});
