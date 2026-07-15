import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { HarnessId } from "@lush/code";
import { LocalCodeOrchestrator } from "../services/agent/src/code/orchestrator";
import { runCommand } from "../services/agent/src/code/process";
import { CodeSessionStore } from "../services/agent/src/code/store";

const harnessId = (process.argv[2] ?? "codex") as HarnessId;
const model = process.argv[3];
if (!(["codex", "claude-code", "opencode"] as string[]).includes(harnessId)) {
  throw new Error(`Unknown harness: ${harnessId}`);
}

const root = await mkdtemp(path.join(tmpdir(), `lush-code-canary-${harnessId}-`));
const repository = path.join(root, "repository");
const state = path.join(root, "state");
const marker = crypto.randomUUID();
const secondMarker = crypto.randomUUID();

try {
  await runCommand(["mkdir", "-p", repository], root);
  await runCommand(["git", "init", "-b", "main"], repository);
  await runCommand(["git", "config", "user.email", "canary@lush.local"], repository);
  await runCommand(["git", "config", "user.name", "Lush Canary"], repository);
  await writeFile(path.join(repository, "README.md"), "# Lush Code canary\n");
  await runCommand(["git", "add", "README.md"], repository);
  await runCommand(["git", "commit", "-m", "initial"], repository);

  const orchestrator = new LocalCodeOrchestrator(new CodeSessionStore(state));
  const session = await orchestrator.startSession({
    draft: {
      repositoryPath: repository,
      baseRef: "main",
      harnessId,
      useWorktree: false,
      autonomy: "accept-edits",
      model
    },
    input: `Create a file named lush-canary.txt containing exactly this value followed by a newline: ${marker}. Do not change any other file. Verify the file and then finish.`
  });

  await waitForTurn(orchestrator, session.id);
  await orchestrator.sendInput(session.id, {
    input: `Append exactly this value followed by a newline to lush-canary.txt: ${secondMarker}. Verify the file now has two lines and then finish.`
  });
  const completed = await waitForTurn(orchestrator, session.id);

  const contents = await readFile(path.join(repository, "lush-canary.txt"), "utf8");
  if (contents !== `${marker}\n${secondMarker}\n`) throw new Error(`${harnessId} wrote unexpected canary contents`);
  const eventKinds = new Set(completed.events.map((event) => event.kind));
  for (const required of ["session.started", "turn.started", "message.delta", "diff.updated", "turn.completed"]) {
    if (!eventKinds.has(required as never)) throw new Error(`${harnessId} canary omitted ${required}`);
  }
  if (completed.events.filter((event) => event.kind === "turn.completed").length !== 2) {
    throw new Error(`${harnessId} did not complete both canary turns`);
  }

  console.log(JSON.stringify({
    harnessId,
    harnessVersion: completed.binding?.harnessVersion,
    model: model ?? "harness default",
    externalSessionId: completed.binding?.externalSessionId,
    eventCount: completed.events.length,
    status: completed.status
  }, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}

async function waitForTurn(orchestrator: LocalCodeOrchestrator, sessionId: string) {
  const deadline = Date.now() + 180_000;
  let session = await orchestrator.getSession(sessionId);
  while (session.status === "running" && Date.now() < deadline) {
    await Bun.sleep(250);
    session = await orchestrator.getSession(sessionId);
  }
  if (session.status === "running") {
    await orchestrator.interrupt(sessionId);
    throw new Error(`${harnessId} canary timed out`);
  }
  if (session.status !== "completed") {
    const diagnostics = session.events
      .filter((event) => event.kind === "diagnostic")
      .slice(-8)
      .map((event) => event.data.message)
      .join("\n");
    throw new Error(
      `${harnessId} canary ${session.status}: ${session.error ?? "unknown failure"}${diagnostics ? `\n${diagnostics}` : ""}`
    );
  }
  return session;
}
