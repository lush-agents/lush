import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createWorkspace,
  inspectRepository,
  readCodeReview,
  readWorkspaceDiff,
  removeManagedWorktree
} from "../services/agent/src/code";
import { runCommand } from "../services/agent/src/code/process";

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("local Code worktrees", () => {
  test("inspects a repository and creates resources only on provisioning", async () => {
    const repository = await mkdtemp(path.join(tmpdir(), "lush-code-repo-"));
    const worktreeRoot = await mkdtemp(path.join(tmpdir(), "lush-code-worktrees-"));
    cleanup.push(repository, worktreeRoot);
    await runCommand(["git", "init", "-b", "main"], repository);
    await runCommand(["git", "config", "user.email", "test@lush.local"], repository);
    await runCommand(["git", "config", "user.name", "Lush Test"], repository);
    await writeFile(path.join(repository, "README.md"), "# Test\n");
    await runCommand(["git", "add", "README.md"], repository);
    await runCommand(["git", "commit", "-m", "initial"], repository);
    await runCommand(["git", "branch", "comparison"], repository);

    const inspected = await inspectRepository(repository);
    expect(inspected.currentBranch).toBe("main");
    expect(inspected.dirty).toBe(false);
    expect((await runCommand(["git", "worktree", "list", "--porcelain"], repository)).match(/worktree /g)).toHaveLength(1);

    const sessionId = crypto.randomUUID();
    const workspace = await createWorkspace(
      sessionId,
      "Add a useful test",
      {
        repositoryPath: repository,
        baseRef: "main",
        harnessId: "codex",
        useWorktree: true,
        autonomy: "accept-edits"
      },
      { worktreeRoot }
    );
    expect(workspace.managedWorktree).toBe(true);
    expect(workspace.branch).toMatch(/^lush\/add-a-useful-test-/);
    expect((await runCommand(["git", "worktree", "list", "--porcelain"], repository)).match(/worktree /g)).toHaveLength(2);

    await writeFile(path.join(workspace.path, "new-file.ts"), "export const answer = 42;\n");
    const externalSecret = path.join(worktreeRoot, "external-secret.txt");
    await writeFile(externalSecret, "must-not-enter-the-diff\n");
    await symlink(externalSecret, path.join(workspace.path, "external-link"));
    const diff = await readWorkspaceDiff(workspace);
    expect(diff.stat).toContain("new-file.ts");
    expect(diff.stat).toContain("external-link | binary");
    expect(diff.patch).toContain("export const answer = 42");
    expect(diff.patch).not.toContain("must-not-enter-the-diff");

    await runCommand(["git", "add", "new-file.ts"], workspace.path);
    await runCommand(["git", "commit", "-m", "add answer"], workspace.path);
    await writeFile(path.join(workspace.path, "README.md"), "# Test\n\nUpdated in the worktree.\n");
    const netReview = await readCodeReview(workspace, "net");
    expect(netReview.comparisonRef).toBe("main");
    expect(netReview.comparisonRefs).toContain("main");
    expect(netReview.commits).toHaveLength(1);
    expect(netReview.commits[0]?.subject).toBe("add answer");
    expect(netReview.worktreeDirty).toBe(true);
    expect(netReview.snapshot.files.map((file) => file.path)).toContain("new-file.ts");
    expect(netReview.snapshot.files.map((file) => file.path)).toContain("README.md");
    expect(netReview.snapshot.additions).toBeGreaterThan(1);

    const comparisonReview = await readCodeReview(workspace, "net", "comparison");
    expect(comparisonReview.comparisonRef).toBe("comparison");
    expect(comparisonReview.snapshot.title).toBe("Diff vs comparison");
    expect(comparisonReview.commits.map((commit) => commit.subject)).toEqual(["add answer"]);

    const commitReview = await readCodeReview(workspace, netReview.commits[0]!.id);
    expect(commitReview.snapshot.title).toBe("add answer");
    expect(commitReview.snapshot.files.map((file) => file.path)).toEqual(["new-file.ts"]);
    expect(commitReview.snapshot.patch).toContain("export const answer = 42");

    const unstagedReview = await readCodeReview(workspace, "unstaged");
    expect(unstagedReview.snapshot.title).toBe("Unstaged changes");
    expect(unstagedReview.snapshot.files.map((file) => file.path)).toContain("README.md");
    expect(unstagedReview.snapshot.files.map((file) => file.path)).not.toContain("new-file.ts");

    await runCommand(["git", "add", "README.md"], workspace.path);
    const stagedReview = await readCodeReview(workspace, "staged");
    expect(stagedReview.snapshot.title).toBe("Staged changes");
    expect(stagedReview.snapshot.files.map((file) => file.path)).toEqual(["README.md"]);
    expect(stagedReview.snapshot.files.map((file) => file.path)).not.toContain("new-file.ts");

    await rm(path.join(workspace.path, "external-link"));
    await runCommand(["git", "reset", "--hard", "HEAD"], workspace.path);
    await removeManagedWorktree(workspace);
    expect((await runCommand(["git", "worktree", "list", "--porcelain"], repository)).match(/worktree /g)).toHaveLength(1);
  });
});
