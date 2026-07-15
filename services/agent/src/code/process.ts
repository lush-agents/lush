export type ProcessLineHandlers = {
  stdout(line: string): void;
  stderr(line: string): void;
};

export type RunningProcess = {
  exited: Promise<number>;
  interrupt(): void;
};

const MAX_LINE_BUFFER_BYTES = 1024 * 1024;

export function spawnJsonLineProcess(options: {
  command: string[];
  cwd: string;
  handlers: ProcessLineHandlers;
}): RunningProcess {
  const [executable, ...args] = options.command;
  if (!executable) throw new Error("Process command is empty");
  const child = spawn(executable, args, {
    cwd: options.cwd,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  consumeLines(child.stdout, options.handlers.stdout);
  consumeLines(child.stderr, options.handlers.stderr);
  let interruptRequested = false;
  const childExited = new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(code ?? (signal ? 128 : 1)));
  });
  const exited = childExited.then(async (exitCode) => {
    if (interruptRequested) {
      signalProcessGroup(child.pid, "SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 100));
      signalProcessGroup(child.pid, "SIGKILL");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return exitCode;
  });

  return {
    exited,
    interrupt() {
      interruptRequested = true;
      signalProcessGroup(child.pid, "SIGINT");
      setTimeout(() => {
        if (child.exitCode === null) signalProcessGroup(child.pid, "SIGTERM");
      }, 2_000);
      setTimeout(() => {
        if (child.exitCode === null) signalProcessGroup(child.pid, "SIGKILL");
      }, 5_000);
    }
  };
}

function signalProcessGroup(pid: number | undefined, signal: NodeJS.Signals) {
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

function consumeLines(
  stream: NodeJS.ReadableStream,
  onLine: (line: string) => void
) {
  const lines = createInterface({ input: stream });
  lines.on("line", (line) => {
    const bounded = Buffer.byteLength(line) > MAX_LINE_BUFFER_BYTES
      ? line.slice(0, MAX_LINE_BUFFER_BYTES)
      : line;
    if (bounded) onLine(bounded);
  });
}

export async function runCommand(command: string[], cwd: string) {
  const result = await runCommandResult(command, cwd);
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`}`);
  }
  return result.stdout.trimEnd();
}

export async function runCommandResult(command: string[], cwd: string) {
  const [executable, ...args] = command;
  if (!executable) throw new Error("Process command is empty");
  const process = spawn(executable, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  process.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
  process.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  const exitCode = await new Promise<number>((resolve, reject) => {
    process.once("error", reject);
    process.once("exit", (code) => resolve(code ?? 1));
  });

  return { stdout, stderr, exitCode };
}
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
