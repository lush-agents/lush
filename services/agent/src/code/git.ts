import { lstat, mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import type {
  CodeReview,
  CodeReviewCommit,
  CodeReviewFile,
  CodeSessionDraft,
  CodeWorkspace,
  RepositoryInspection
} from "@lush/code";
import { readFile } from "node:fs/promises";
import { runCommand, runCommandResult } from "./process";

const repositoryLocks = new Map<string, Promise<void>>();

export async function inspectRepository(repositoryPath: string): Promise<RepositoryInspection> {
  const candidate = path.resolve(repositoryPath.trim());
  const root = await runCommand(["git", "rev-parse", "--show-toplevel"], candidate);
  const [commonDirectory, headCommit, branch, status, branchRows] = await Promise.all([
    runCommand(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], root),
    runCommand(["git", "rev-parse", "HEAD"], root),
    runCommand(["git", "branch", "--show-current"], root),
    runCommand(["git", "status", "--porcelain=v1", "--untracked-files=normal"], root),
    runCommand([
      "git",
      "for-each-ref",
      "--sort=-committerdate",
      "--format=%(refname:short)%09%(objectname)",
      "refs/heads"
    ], root)
  ]);

  return {
    root,
    commonDirectory,
    name: path.basename(root),
    headCommit,
    currentBranch: branch || undefined,
    dirty: Boolean(status),
    branches: branchRows
      .split("\n")
      .filter(Boolean)
      .map((row: string) => {
        const [name = "", commit = ""] = row.split("\t");
        return { name, commit, current: name === branch };
      })
  };
}

export async function createWorkspace(
  sessionId: string,
  title: string,
  draft: CodeSessionDraft,
  options: { worktreeRoot?: string } = {}
): Promise<CodeWorkspace> {
  const repository = await inspectRepository(draft.repositoryPath);
  const baseCommit = await runCommand(["git", "rev-parse", `${draft.baseRef}^{commit}`], repository.root);

  if (!draft.useWorktree) {
    return {
      repositoryRoot: repository.root,
      path: repository.root,
      branch: repository.currentBranch ?? "detached",
      baseRef: draft.baseRef,
      baseCommit,
      managedWorktree: false
    };
  }

  return withRepositoryLock(repository.commonDirectory, async () => {
    const slug = slugify(title) || "session";
    const branch = `lush/${slug}-${sessionId.slice(0, 8)}`;
    const repositoryKey = createHash("sha256")
      .update(repository.commonDirectory)
      .digest("hex")
      .slice(0, 12);
    const worktreeRoot = options.worktreeRoot ?? path.join(homedir(), ".lush", "worktrees");
    const worktreePath = path.join(worktreeRoot, repositoryKey, sessionId);
    await mkdir(path.dirname(worktreePath), { recursive: true });

    try {
      await runCommand(
        ["git", "worktree", "add", "--no-track", "-b", branch, worktreePath, baseCommit],
        repository.root
      );
    } catch (error) {
      await rm(worktreePath, { recursive: true, force: true });
      throw error;
    }

    return {
      repositoryRoot: repository.root,
      path: worktreePath,
      branch,
      baseRef: draft.baseRef,
      baseCommit,
      managedWorktree: true
    };
  });
}

export async function readWorkspaceDiff(workspace: CodeWorkspace) {
  const review = await readCodeReview(workspace, "net");
  const stat = review.snapshot.files
    .map((file) => ` ${file.path} | ${formatFileStat(file)}`)
    .join("\n");
  return {
    patch: review.snapshot.patch,
    stat,
    truncated: review.snapshot.truncated
  };
}

export async function readCodeReview(
  workspace: CodeWorkspace,
  revision: "net" | "unstaged" | "staged" | "worktree" | string = "net",
  requestedComparisonRef?: string
): Promise<CodeReview> {
  const [headCommit, status, branchRows] = await Promise.all([
    runCommand(["git", "rev-parse", "HEAD"], workspace.path),
    runCommand(["git", "status", "--porcelain=v1", "-z", "--untracked-files=all"], workspace.path),
    runCommand([
      "git",
      "for-each-ref",
      "--sort=refname",
      "--format=%(refname:short)",
      "refs/heads"
    ], workspace.path)
  ]);
  const comparisonRefs = branchRows
    .split("\n")
    .filter((ref) => ref && ref !== workspace.branch);
  const defaultComparisonRef = comparisonRefs.includes("main")
    ? "main"
    : comparisonRefs.includes(workspace.baseRef)
      ? workspace.baseRef
      : comparisonRefs[0] ?? workspace.baseRef;
  const comparisonRef = requestedComparisonRef?.trim() || defaultComparisonRef;
  if (!comparisonRefs.includes(comparisonRef) && comparisonRef !== workspace.baseRef) {
    throw new Error("The requested comparison branch is unavailable");
  }
  const comparisonCommit = await runCommand(
    ["git", "rev-parse", `${comparisonRef}^{commit}`],
    workspace.path
  );
  const [comparisonBaseCommit, log] = await Promise.all([
    runCommand(["git", "merge-base", comparisonCommit, headCommit], workspace.path),
    runCommand([
      "git",
      "log",
      "--format=%H%x00%h%x00%an%x00%aI%x00%s%x1e",
      `${comparisonCommit}..HEAD`
    ], workspace.path)
  ]);
  const commits = parseCommits(log);
  const worktreeDirty = Boolean(status);
  const workspaceRevisions = new Set(["net", "unstaged", "staged", "worktree"]);
  if (!workspaceRevisions.has(revision) && !commits.some((commit) => commit.id === revision)) {
    throw new Error("The requested commit is outside this Code session");
  }

  const untrackedFiles = revision === "net" || revision === "unstaged" || revision === "worktree"
    ? parseUntrackedFiles(status)
    : [];
  const diffArguments = revision === "net"
    ? ["diff", "--no-ext-diff", "--no-color", "--find-renames", comparisonBaseCommit, "--"]
    : revision === "unstaged"
      ? ["diff", "--no-ext-diff", "--no-color", "--find-renames", "--"]
      : revision === "staged"
        ? ["diff", "--cached", "--no-ext-diff", "--no-color", "--find-renames", "HEAD", "--"]
        : revision === "worktree"
          ? ["diff", "--no-ext-diff", "--no-color", "--find-renames", "HEAD", "--"]
          : undefined;
  const [trackedPatch, files] = diffArguments
    ? await Promise.all([
        runCommand(["git", ...diffArguments], workspace.path),
        readChangedFiles(workspace.path, diffArguments, untrackedFiles)
      ])
    : await Promise.all([
        runCommand(["git", "show", "--format=", "--patch", "--no-ext-diff", "--no-color", "--find-renames", revision], workspace.path),
        readChangedFiles(workspace.path, ["show", "--format=", "--find-renames", revision], [])
      ]);
  const untrackedPatches = untrackedFiles.length
    ? await readUntrackedPatches(workspace.path, untrackedFiles)
    : [];
  const patch = [trackedPatch, ...untrackedPatches].filter(Boolean).join("\n");
  const maxBytes = 2 * 1024 * 1024;
  const selectedCommit = commits.find((commit) => commit.id === revision);

  return {
    baseCommit: comparisonCommit,
    headCommit,
    comparisonRef,
    comparisonRefs,
    worktreeDirty,
    commits,
    snapshot: {
      revision,
      title: revision === "net"
        ? `Diff vs ${comparisonRef}`
        : revision === "unstaged"
          ? "Unstaged changes"
          : revision === "staged"
            ? "Staged changes"
        : revision === "worktree"
          ? "Uncommitted changes"
          : selectedCommit?.subject ?? revision.slice(0, 8),
      patch: Buffer.byteLength(patch) > maxBytes ? patch.slice(0, maxBytes) : patch,
      files,
      additions: files.reduce((total, file) => total + (file.additions ?? 0), 0),
      deletions: files.reduce((total, file) => total + (file.deletions ?? 0), 0),
      binaryFiles: files.filter((file) => file.additions === null || file.deletions === null).length,
      truncated: Buffer.byteLength(patch) > maxBytes
    }
  };
}

function parseUntrackedFiles(status: string) {
  return status
    .split("\0")
    .filter((entry) => entry.startsWith("?? "))
    .map((entry) => entry.slice(3));
}

async function readUntrackedPatches(workspacePath: string, untrackedFiles: string[]) {
  const untrackedPatches: string[] = [];
  for (const relativePath of untrackedFiles) {
    const absolutePath = path.resolve(workspacePath, relativePath);
    if (!absolutePath.startsWith(`${path.resolve(workspacePath)}${path.sep}`)) continue;
    const file = await lstat(absolutePath);
    if (!file.isFile()) continue;
    const result = await runCommandResult(
      ["git", "diff", "--no-index", "--no-ext-diff", "--no-color", "--", "/dev/null", relativePath],
      workspacePath
    );
    if (result.exitCode === 0 || result.exitCode === 1) untrackedPatches.push(result.stdout);
  }
  return untrackedPatches;
}

async function readChangedFiles(
  workspacePath: string,
  gitArguments: string[],
  untrackedFiles: string[]
): Promise<CodeReviewFile[]> {
  const [numstat, nameStatus] = await Promise.all([
    runCommand(["git", ...gitArguments.slice(0, 1), "--numstat", ...gitArguments.slice(1)], workspacePath),
    runCommand(["git", ...gitArguments.slice(0, 1), "--name-status", ...gitArguments.slice(1)], workspacePath)
  ]);
  const stats = numstat.split("\n").filter(Boolean);
  const statuses = nameStatus.split("\n").filter(Boolean);
  const files: CodeReviewFile[] = stats.map((row, index) => {
    const [additions = "-", deletions = "-", ...pathParts] = row.split("\t");
    const statusParts = (statuses[index] ?? "M").split("\t");
    const statusCode = statusParts[0] ?? "M";
    const renamed = statusCode.startsWith("R") || statusCode.startsWith("C");
    const parsedPath = renamed ? statusParts[2] : statusParts[1];
    return {
      path: parsedPath ?? pathParts.join("\t"),
      previousPath: renamed ? statusParts[1] : undefined,
      status: mapGitStatus(statusCode),
      additions: additions === "-" ? null : Number(additions),
      deletions: deletions === "-" ? null : Number(deletions)
    } satisfies CodeReviewFile;
  });

  for (const relativePath of untrackedFiles) {
    const absolutePath = path.resolve(workspacePath, relativePath);
    if (!absolutePath.startsWith(`${path.resolve(workspacePath)}${path.sep}`)) continue;
    const file = await lstat(absolutePath);
    let additions: number | null = null;
    if (file.isFile()) {
      const contents = await readFile(absolutePath);
      if (!contents.includes(0)) {
        const text = contents.toString("utf8");
        additions = text ? text.split("\n").length - (text.endsWith("\n") ? 1 : 0) : 0;
      }
    }
    files.push({ path: relativePath, status: "added", additions, deletions: additions === null ? null : 0 });
  }
  return files;
}

function parseCommits(log: string): CodeReviewCommit[] {
  return log
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [id = "", shortId = "", authorName = "", authoredAt = "", subject = ""] = record.split("\0");
      return { id, shortId, authorName, authoredAt, subject };
    });
}

function mapGitStatus(status: string): CodeReviewFile["status"] {
  if (status.startsWith("A")) return "added";
  if (status.startsWith("D")) return "deleted";
  if (status.startsWith("R")) return "renamed";
  if (status.startsWith("C")) return "copied";
  if (status.startsWith("T")) return "type-changed";
  if (status.startsWith("U")) return "unmerged";
  return "modified";
}

function formatFileStat(file: CodeReviewFile) {
  if (file.additions === null || file.deletions === null) return "binary";
  return `+${file.additions} -${file.deletions}`;
}

export async function removeManagedWorktree(workspace: CodeWorkspace) {
  if (!workspace.managedWorktree) return;
  await withRepositoryLock(workspace.repositoryRoot, async () => {
    await runCommand(["git", "worktree", "remove", workspace.path], workspace.repositoryRoot);
  });
}

async function withRepositoryLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = repositoryLocks.get(key) ?? Promise.resolve();
  let release = () => {};
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  repositoryLocks.set(key, queued);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (repositoryLocks.get(key) === queued) repositoryLocks.delete(key);
  }
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36);
}
