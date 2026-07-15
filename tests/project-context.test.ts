import { expect, test } from "bun:test";
import { projectSystemPrompt } from "../services/agent/src/runtime";
import { projectContextForPrompt } from "../services/agent/src/session-context";
import { apiSpec } from "../services/api/src/spec";

test("project context augments the agent system prompt", () => {
  const prompt = projectSystemPrompt("Base instructions", {
    name: "Sales",
    instructions: "Use account intelligence first.",
    memory: "The user prefers concise summaries.",
    contextItems: [
      {
        filename: "brief.md",
        mediaType: "text/markdown",
        content: "Target enterprise accounts."
      }
    ]
  });

  expect(prompt).toContain("Base instructions");
  expect(prompt).toContain('<project name="Sales">');
  expect(prompt).toContain("<instructions>\nUse account intelligence first.");
  expect(prompt).toContain("<memory>\nThe user prefers concise summaries.");
  expect(prompt).toContain('<file name="brief.md" media-type="text/markdown">');
  expect(prompt).toContain("Target enterprise accounts.");
});

test("project context is bounded without splitting unicode", () => {
  const context = projectContextForPrompt([
    { filename: "one.txt", mediaType: "text/plain", content: "hello" },
    { filename: "two.txt", mediaType: "text/plain", content: " 👋 world" }
  ], 10);

  expect(context).toEqual([
    { filename: "one.txt", mediaType: "text/plain", content: "hello" },
    { filename: "two.txt", mediaType: "text/plain", content: " 👋" }
  ]);
});

test("project routes expose identity, context, and lifecycle operations", () => {
  const routes = new Set(apiSpec.routes.map((route) => route.path));

  expect(routes.has("/v1beta/projects")).toBe(true);
  expect(routes.has("/v1beta/projects/:projectId")).toBe(true);
  expect(routes.has("/v1beta/projects/:projectId/context")).toBe(true);
  expect(
    routes.has("/v1beta/projects/:projectId/context/:contextId/delete")
  ).toBe(true);
});
