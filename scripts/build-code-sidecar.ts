import { mkdir } from "node:fs/promises";
import path from "node:path";

if (process.platform !== "darwin") {
  throw new Error("The initial Lush Code sidecar build supports macOS only");
}

const target = process.arch === "arm64"
  ? "aarch64-apple-darwin"
  : "x86_64-apple-darwin";
const repository = path.resolve(import.meta.dir, "..");
const outputDirectory = path.join(repository, "apps/lush/src-tauri/binaries");
const output = path.join(outputDirectory, `lush-agent-${target}`);
await mkdir(outputDirectory, { recursive: true });

const processResult = Bun.spawn({
  cmd: [
    "bun",
    "build",
    "--compile",
    "--minify",
    "--outfile",
    output,
    path.join(repository, "services/agent/src/code/sidecar.ts")
  ],
  cwd: repository,
  stdout: "inherit",
  stderr: "inherit"
});

const exitCode = await processResult.exited;
if (exitCode !== 0) process.exit(exitCode);
