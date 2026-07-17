import { describe, expect, test } from "bun:test";

const workflowPaths = [
  ".github/workflows/release.yml",
  ".github/workflows/test.yml",
  ".github/workflows/publish-images.yml"
];

describe("workflow security invariants", () => {
  test("pins every external action to an immutable commit", async () => {
    for (const path of workflowPaths) {
      const workflow = await Bun.file(path).text();
      for (const match of workflow.matchAll(/^\s*uses:\s*([^\s#]+)/gm)) {
        const target = match[1]!;
        if (target.startsWith("./")) {
          continue;
        }

        const separator = target.lastIndexOf("@");
        if (separator <= 0) {
          throw new Error(`${path}: ${target} has no ref`);
        }
        if (!/^[a-f0-9]{40}$/.test(target.slice(separator + 1))) {
          throw new Error(
            `${path}: ${target} must use a 40-character commit SHA`
          );
        }
      }
    }
  });

  test("normal CI and release validation both run database integration tests", async () => {
    for (const path of [
      ".github/workflows/test.yml",
      ".github/workflows/publish-images.yml"
    ]) {
      const workflow = await Bun.file(path).text();
      expect(workflow).toContain("LUSH_TEST_DATABASE_URL:");
      expect(workflow).toContain("image: postgres:17@sha256:");
      expect(workflow).toContain("bun test");
    }
  });

  test("Dependabot owns GitHub Action SHA updates", async () => {
    const config = await Bun.file(".github/dependabot.yml").text();
    expect(config).toContain("package-ecosystem: github-actions");
  });

  test("CI and release publication validate the static web distribution", async () => {
    const testWorkflow = await Bun.file(".github/workflows/test.yml").text();
    expect(testWorkflow).toContain("name: Build lush-web distribution");
    expect(testWorkflow).toContain("web-distribution.ts verify");

    const publishWorkflow = await Bun.file(
      ".github/workflows/publish-images.yml"
    ).text();
    expect(publishWorkflow).toContain("name: Build lush-web distribution");
    expect(publishWorkflow).toContain("subject-path:");
    expect(publishWorkflow).toContain(".tar.gz.sha256");
    expect(publishWorkflow).toContain("gh release upload");
    expect(publishWorkflow).toMatch(
      /publish:\n[\s\S]*?needs:\n\s+- prepare\n\s+- web-distribution/
    );
  });
});
