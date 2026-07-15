import { describe, expect, test } from "bun:test";
import {
  ClaudeLineParser,
  CodexLineParser,
  OpenCodeLineParser
} from "../services/agent/src/code/adapters";
import { validateHelpSurface } from "../services/agent/src/code/adapters/shared";

async function parseFixture(
  fixture: string,
  parser: { parse(line: string): { externalSessionId?: string; events: Array<{ kind: string; data: unknown }> } }
) {
  const lines = (await Bun.file(`services/agent/fixtures/code/${fixture}`).text())
    .trim()
    .split("\n");
  const events: Array<{ kind: string; data: unknown }> = [];
  let sessionId: string | undefined;
  for (const line of lines) {
    const parsed = parser.parse(line);
    sessionId = parsed.externalSessionId ?? sessionId;
    events.push(...parsed.events);
  }
  return { events, sessionId };
}

describe("Code adapter fixtures", () => {
  test("fails structural qualification when a required CLI surface disappears", () => {
    expect(validateHelpSurface("--json --sandbox", ["--json", "resume", "--sandbox"]))
      .toEqual(["resume"]);
    expect(validateHelpSurface("--json resume --sandbox", ["--json", "resume", "--sandbox"]))
      .toEqual([]);
  });
  test("normalizes Codex exec events", async () => {
    const result = await parseFixture("codex-exec.jsonl", new CodexLineParser());
    expect(result.sessionId).toBe("11111111-1111-4111-8111-111111111111");
    expect(result.events.map((event) => event.kind)).toEqual([
      "command.started",
      "command.completed",
      "message.delta",
      "usage.updated"
    ]);
    expect(result.events[2]?.data).toMatchObject({ delta: "Implemented the change." });
  });

  test("normalizes Claude deltas without duplicating the completed message", async () => {
    const result = await parseFixture("claude-stream.jsonl", new ClaudeLineParser());
    expect(result.sessionId).toBe("22222222-2222-4222-8222-222222222222");
    expect(result.events.filter((event) => event.kind === "message.delta")).toHaveLength(1);
    expect(result.events.map((event) => event.kind)).toContain("reasoning.delta");
    expect(result.events.map((event) => event.kind)).toContain("tool.started");
    expect(result.events.map((event) => event.kind)).toContain("tool.completed");
  });

  test("normalizes OpenCode tool, text, and usage parts", async () => {
    const result = await parseFixture("opencode-run.jsonl", new OpenCodeLineParser());
    expect(result.sessionId).toBe("33333333-3333-4333-8333-333333333333");
    expect(result.events.map((event) => event.kind)).toEqual([
      "tool.started",
      "tool.completed",
      "message.delta",
      "usage.updated"
    ]);
  });
});
