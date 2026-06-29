import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { currentEnv } from "@lush/config/env";

type ColorName = "blue" | "cyan" | "green" | "magenta" | "red" | "yellow";

export type CommandConfig = {
  name: string;
  command: string[];
  color?: ColorName;
  env?: Record<string, string>;
  timeoutSeconds?: number;
};

export type ManagedProcessConfig = CommandConfig & {
  restartDelaySeconds?: number;
  maxRestartDelaySeconds?: number;
  restartResetSeconds?: number;
};

export type DockerDependencyConfig = {
  name: string;
  color?: ColorName;
  preflightCommand?: string[];
  preflightFailureMessage?: string;
  startCommand: string[];
  stopCommand?: string[];
  readyCommand: string[];
  readyTimeoutSeconds?: number;
  watchIntervalSeconds?: number;
};

export type ProcessManagerConfig = {
  logDir?: string;
  processDefaults?: {
    timeoutSeconds?: number;
    restartDelaySeconds?: number;
    maxRestartDelaySeconds?: number;
    restartResetSeconds?: number;
  };
  dockerDependencies?: DockerDependencyConfig[];
  tasks?: CommandConfig[];
  processes: ManagedProcessConfig[];
};

type Subprocess = ReturnType<typeof Bun.spawn>;

type ChildState = {
  process: Subprocess;
  service: ManagedProcessConfig;
  startedAt: number;
};

const reset = "\x1b[0m";
const dim = "\x1b[2m";
const colors: Record<ColorName, string> = {
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  yellow: "\x1b[33m"
};

export class ProcessManager {
  private readonly logDir: string;
  private shuttingDown = false;
  private readonly children = new Map<Subprocess, ChildState>();
  private readonly restartAttempts = new Map<string, number>();
  private readonly restartTimers = new Set<ReturnType<typeof setTimeout>>();
  private readonly dockerWatchTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly dockerRestarting = new Set<string>();
  private readonly startedDockerDependencies = new Set<string>();
  private readonly intentionallyStoppedChildren = new Set<Subprocess>();
  private readonly logStreams = new Map<string, WriteStream>();

  constructor(private readonly config: ProcessManagerConfig) {
    this.logDir = path.resolve(process.cwd(), config.logDir ?? "logs");
  }

  installSignalHandlers() {
    process.on("SIGINT", () => void this.shutdown(0));
    process.on("SIGTERM", () => void this.shutdown(0));
  }

  async start() {
    await mkdir(this.logDir, { recursive: true });

    for (const dependency of this.config.dockerDependencies ?? []) {
      await this.startDockerDependency(dependency);
      this.watchDockerDependency(dependency);
    }

    if (!(await this.runConfiguredTasks())) {
      return;
    }

    for (const service of this.config.processes) {
      this.startManagedProcess(service);
    }
  }

  async shutdown(exitCode: number) {
    if (this.shuttingDown) {
      return;
    }

    this.shuttingDown = true;
    console.log(`${dim}stopping dev services${reset}`);

    for (const timer of this.dockerWatchTimers.values()) {
      clearTimeout(timer);
    }
    this.dockerWatchTimers.clear();

    for (const timer of this.restartTimers) {
      clearTimeout(timer);
    }
    this.restartTimers.clear();

    await Promise.allSettled(
      [...this.children.values()].map((child) => this.stopChild(child))
    );

    for (const dependency of this.config.dockerDependencies ?? []) {
      await this.stopDockerDependency(dependency);
    }

    await this.closeLogs();

    process.exit(exitCode);
  }

  private startManagedProcess(service: ManagedProcessConfig) {
    this.status(service, `starting: ${service.command.join(" ")}`);
    const startedAt = Date.now();
    const proc = Bun.spawn({
      cmd: service.command,
      env: this.commandEnv(service),
      stdout: "pipe",
      stderr: "pipe"
    });

    this.children.set(proc, { process: proc, service, startedAt });
    const stdoutDone = this.pipeLines(service, proc.stdout, false);
    const stderrDone = this.pipeLines(service, proc.stderr, true);

    proc.exited.then(async (exitCode) => {
      await Promise.allSettled([stdoutDone, stderrDone]);
      this.children.delete(proc);
      this.status(service, `exited with code ${exitCode}`);

      const intentionallyStopped = this.intentionallyStoppedChildren.delete(proc);
      if (!this.shuttingDown && !intentionallyStopped) {
        this.scheduleRestart(service, startedAt);
      }
    });
  }

  private scheduleRestart(service: ManagedProcessConfig, startedAt: number) {
    const runtimeMs = Date.now() - startedAt;
    const restartResetMs = this.seconds(
      service.restartResetSeconds,
      this.config.processDefaults?.restartResetSeconds,
      10
    );
    const attempts =
      runtimeMs >= restartResetMs
        ? 0
        : (this.restartAttempts.get(service.name) ?? 0) + 1;
    this.restartAttempts.set(service.name, attempts);

    const baseDelayMs = this.seconds(
      service.restartDelaySeconds,
      this.config.processDefaults?.restartDelaySeconds,
      0.5
    );
    const maxDelayMs = this.seconds(
      service.maxRestartDelaySeconds,
      this.config.processDefaults?.maxRestartDelaySeconds,
      10
    );
    const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempts - 1));

    this.status(service, `restarting in ${delayMs}ms`);
    const timer = setTimeout(() => {
      this.restartTimers.delete(timer);
      if (!this.shuttingDown) {
        this.startManagedProcess(service);
      }
    }, delayMs);
    this.restartTimers.add(timer);
  }

  private async runTask(task: CommandConfig) {
    const exitCode = await this.runCommand(task, "running", this.taskTimeoutMs(task));
    if (exitCode !== 0) {
      this.status(task, `failed with code ${exitCode}`);
      await this.shutdown(exitCode);
      return false;
    }

    this.status(task, "complete");
    return true;
  }

  private async runConfiguredTasks() {
    for (const task of this.config.tasks ?? []) {
      if (!(await this.runTask(task))) {
        return false;
      }
    }

    return true;
  }

  private async startDockerDependency(dependency: DockerDependencyConfig) {
    await this.preflightDockerDependency(dependency);
    const service = this.commandForDependency(dependency, dependency.startCommand);
    const exitCode = await this.runCommand(service, "running");
    if (exitCode !== 0) {
      this.status(service, `failed with code ${exitCode}`);
      await this.shutdown(exitCode);
      return;
    }

    this.startedDockerDependencies.add(dependency.name);
    this.status(service, "complete");
    await this.waitForDockerDependency(dependency, true);
  }

  private async preflightDockerDependency(dependency: DockerDependencyConfig) {
    if (!dependency.preflightCommand) {
      return;
    }

    const proc = Bun.spawn({
      cmd: dependency.preflightCommand,
      stdout: "pipe",
      stderr: "pipe"
    });
    const [, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited
    ]);

    if (exitCode !== 0) {
      const service = this.commandForDependency(dependency, dependency.preflightCommand);
      this.error(
        service,
        dependency.preflightFailureMessage ??
          `${dependency.name} preflight failed with code ${exitCode}.`
      );
      if (stderr.trim()) {
        this.error(service, stderr.trim());
      }
      await this.shutdown(exitCode);
    }
  }

  private async waitForDockerDependency(
    dependency: DockerDependencyConfig,
    fatal: boolean
  ) {
    const service = this.commandForDependency(dependency, dependency.readyCommand);
    const timeoutMs = this.seconds(dependency.readyTimeoutSeconds, undefined, 15);
    const deadline = Date.now() + timeoutMs;
    let loggedWaiting = false;

    while (Date.now() < deadline) {
      if (await this.isDockerDependencyReady(dependency)) {
        this.status(service, "ready");
        return true;
      }

      if (!loggedWaiting) {
        this.status(service, "waiting for readiness");
        loggedWaiting = true;
      }
      await sleep(500);
    }

    this.error(
      service,
      `${dependency.name} did not become ready in time. Check its logs for details.`
    );
    if (fatal) {
      await this.shutdown(1);
    }
    return false;
  }

  private watchDockerDependency(dependency: DockerDependencyConfig) {
    if (this.shuttingDown) {
      return;
    }

    const intervalMs = this.seconds(dependency.watchIntervalSeconds, undefined, 5);
    const timer = setTimeout(() => {
      void this.checkDockerDependency(dependency);
    }, intervalMs);
    this.dockerWatchTimers.set(dependency.name, timer);
  }

  private async checkDockerDependency(dependency: DockerDependencyConfig) {
    this.dockerWatchTimers.delete(dependency.name);
    if (this.shuttingDown) {
      return;
    }

    if (
      !this.dockerRestarting.has(dependency.name) &&
      !(await this.isDockerDependencyReady(dependency))
    ) {
      this.dockerRestarting.add(dependency.name);
      const service = this.commandForDependency(dependency, dependency.startCommand);
      this.status(service, "not ready; restarting");
      const exitCode = await this.runCommand(service, "running");
      if (exitCode === 0) {
        this.startedDockerDependencies.add(dependency.name);
        const ready = await this.waitForDockerDependency(dependency, false);
        if (!ready) {
          this.status(service, "restart did not become ready; will retry");
        } else if (await this.runConfiguredTasks()) {
          await this.restartManagedProcesses(service);
        }
      } else {
        this.status(service, `restart failed with code ${exitCode}`);
      }
      this.dockerRestarting.delete(dependency.name);
    }

    this.watchDockerDependency(dependency);
  }

  private async isDockerDependencyReady(dependency: DockerDependencyConfig) {
    const proc = Bun.spawn({
      cmd: dependency.readyCommand,
      stdout: "ignore",
      stderr: "ignore"
    });
    return (await proc.exited) === 0;
  }

  private async stopDockerDependency(dependency: DockerDependencyConfig) {
    if (!dependency.stopCommand || !this.startedDockerDependencies.has(dependency.name)) {
      return;
    }

    const service = this.commandForDependency(dependency, dependency.stopCommand);
    const exitCode = await this.runCommand(service, "stopping");
    if (exitCode !== 0) {
      this.status(service, `stop failed with code ${exitCode}`);
      return;
    }

    this.status(service, "stopped");
  }

  private async restartManagedProcesses(service: CommandConfig) {
    const children = [...this.children.values()];
    if (children.length === 0) {
      return;
    }

    this.status(service, "restarting managed processes after recovery");
    await Promise.allSettled(
      children.map((child) => this.stopChild(child, { suppressRestart: true }))
    );

    if (this.shuttingDown) {
      return;
    }

    for (const processConfig of this.config.processes) {
      this.startManagedProcess(processConfig);
    }
  }

  private async stopChild(
    child: ChildState,
    options: { suppressRestart?: boolean } = {}
  ) {
    if (options.suppressRestart) {
      this.intentionallyStoppedChildren.add(child.process);
    }
    const timeoutMs = this.taskTimeoutMs(child.service);
    child.process.kill("SIGTERM");
    const exited = await Promise.race([
      child.process.exited.then(() => true),
      sleep(timeoutMs).then(() => false)
    ]);

    if (!exited) {
      this.status(child.service, "stop timed out; killing");
      child.process.kill("SIGKILL");
      await child.process.exited;
    }
  }

  private async runCommand(
    service: CommandConfig,
    action: string,
    timeoutMs?: number
  ) {
    this.status(service, `${action}: ${service.command.join(" ")}`);
    const proc = Bun.spawn({
      cmd: service.command,
      env: this.commandEnv(service),
      stdout: "pipe",
      stderr: "pipe"
    });

    const stdoutDone = this.pipeLines(service, proc.stdout, false);
    const stderrDone = this.pipeLines(service, proc.stderr, true);

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutExit =
      timeoutMs === undefined
        ? undefined
        : new Promise<number>((resolve) => {
            timeout = setTimeout(() => {
              this.status(service, `timed out after ${timeoutMs}ms`);
              proc.kill("SIGTERM");
              resolve(124);
            }, timeoutMs);
          });

    const exitCode = await (timeoutExit
      ? Promise.race([proc.exited, timeoutExit])
      : proc.exited);
    if (timeout) {
      clearTimeout(timeout);
    }
    await Promise.allSettled([stdoutDone, stderrDone]);
    return exitCode;
  }

  private async pipeLines(
    service: CommandConfig,
    stream: ReadableStream<Uint8Array> | null,
    isError: boolean
  ) {
    if (!stream) {
      return;
    }

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line) {
          this.line(service, line, isError);
        }
      }
    }

    if (buffer) {
      this.line(service, buffer, isError);
    }
  }

  private commandForDependency(
    dependency: DockerDependencyConfig,
    command: string[]
  ): CommandConfig {
    return {
      name: dependency.name,
      color: dependency.color,
      command
    };
  }

  private commandEnv(command: CommandConfig) {
    return {
      ...currentEnv(),
      ...resolveCommandEnv(command.env)
    };
  }

  private taskTimeoutMs(command: CommandConfig) {
    return this.seconds(
      command.timeoutSeconds,
      this.config.processDefaults?.timeoutSeconds,
      10
    );
  }

  private seconds(
    serviceValue: number | undefined,
    defaultValue: number | undefined,
    fallback: number
  ) {
    return (serviceValue ?? defaultValue ?? fallback) * 1000;
  }

  private line(service: CommandConfig, line: string, isError: boolean) {
    const output = isError ? console.error : console.log;
    const stream = isError ? "stderr" : "stdout";
    output(`${this.color(service)}${service.name.padEnd(7)}${reset} ${line}`);
    this.writeLog(service.name, `[${new Date().toISOString()}] [${stream}] ${line}`);
  }

  private status(service: CommandConfig, message: string) {
    console.log(
      `${this.color(service)}${service.name.padEnd(7)}${reset} ${dim}${message}${reset}`
    );
    this.writeLog(service.name, `[${new Date().toISOString()}] [status] ${message}`);
  }

  private error(service: CommandConfig, message: string) {
    console.error(`${this.color(service)}${service.name.padEnd(7)}${reset} ${message}`);
    this.writeLog(service.name, `[${new Date().toISOString()}] [error] ${message}`);
  }

  private writeLog(serviceName: string, line: string) {
    this.logStream(serviceName).write(`${line}\n`);
  }

  private logStream(serviceName: string) {
    const logName = sanitizeLogName(serviceName);
    const existing = this.logStreams.get(logName);
    if (existing) {
      return existing;
    }

    const stream = createWriteStream(path.join(this.logDir, `${logName}.log`), {
      flags: "a"
    });
    this.logStreams.set(logName, stream);
    return stream;
  }

  private async closeLogs() {
    const streams = [...this.logStreams.values()];
    this.logStreams.clear();
    await Promise.all(
      streams.map(
        (stream) =>
          new Promise<void>((resolve) => {
            stream.end(resolve);
          })
      )
    );
  }

  private color(service: CommandConfig) {
    return service.color ? colors[service.color] ?? "" : "";
  }
}

export function resolveCommandEnv(
  env?: Record<string, string>,
  sourceEnv: Record<string, string | undefined> = currentEnv()
) {
  if (!env) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [
      key,
      interpolateEnv(value, sourceEnv)
    ])
  );
}

export function interpolateEnv(
  value: string,
  sourceEnv: Record<string, string | undefined> = currentEnv()
) {
  return value.replace(/\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/g, (_, name, fallback) => {
    const envValue = sourceEnv[name];
    if (envValue) {
      return envValue;
    }
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`${name} is required. Check .env.development for local dev defaults.`);
  });
}

export function sanitizeLogName(serviceName: string) {
  return serviceName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
