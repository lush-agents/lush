import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const allowedEnvAccessFiles = [
  "apps/lush/src/lib/app-data.ts",
  "packages/config/src/env.ts"
];
const scanRoots = ["apps", "packages", "services", "scripts"];
const envAccessPattern = /process\.env|Bun\.env|import\.meta\.env/;
const sourceFilePattern = /\.(?:[cm]?[jt]sx?|mdx?)$/;
const ignoredDirectories = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  "logs"
]);
const ignoredPaths = new Set(["services/docs/generated"]);

function normalizePath(filePath: string) {
  return filePath.split(path.sep).join("/");
}

async function findEnvAccessFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const matches: string[] = [];

  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    const relativePath = normalizePath(filePath);

    if (entry.isDirectory()) {
      if (
        entry.name.startsWith(".") ||
        ignoredDirectories.has(entry.name) ||
        ignoredPaths.has(relativePath)
      ) {
        continue;
      }

      matches.push(...(await findEnvAccessFiles(filePath)));
      continue;
    }

    if (!entry.isFile() || !sourceFilePattern.test(entry.name)) {
      continue;
    }

    const contents = await readFile(filePath, "utf8");
    if (envAccessPattern.test(contents)) {
      matches.push(relativePath);
    }
  }

  return matches;
}

test("runtime env access goes through the config boundary", async () => {
  const files = (await Promise.all(scanRoots.map(findEnvAccessFiles)))
    .flat()
    .sort();

  expect(files).toEqual(allowedEnvAccessFiles);
});
