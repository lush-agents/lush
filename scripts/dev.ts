type Service = {
  name: string;
  command: string[];
  color: string;
  env?: Record<string, string>;
};

const reset = "\x1b[0m";
const dim = "\x1b[2m";
const services: Service[] = [
  {
    name: "api",
    command: ["bun", "--bun", "run", "--cwd", "services/api", "dev"],
    color: "\x1b[36m",
    env: {
      LUSH_API_PORT: "7330",
      LUSH_API_HOST: "0.0.0.0",
      LUSH_APP_ORIGIN:
        "http://localhost:1420,http://127.0.0.1:1420,tauri://localhost,http://tauri.localhost,https://tauri.localhost"
    }
  },
  {
    name: "app",
    command: ["bun", "--bun", "run", "--cwd", "apps/lush", "dev"],
    color: "\x1b[35m",
    env: {
      VITE_LUSH_API_BASE_URL: "http://127.0.0.1:7330"
    }
  }
];

let shuttingDown = false;
const children = new Set<ReturnType<typeof Bun.spawn>>();

process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));

await runCodegen();
for (const service of services) {
  startService(service);
}

function startService(service: Service) {
  logStatus(service, `starting: ${service.command.join(" ")}`);

  const proc = Bun.spawn({
    cmd: service.command,
    env: {
      ...Bun.env,
      ...service.env
    },
    stdout: "pipe",
    stderr: "pipe"
  });

  children.add(proc);
  void pipeLines(service, proc.stdout, false);
  void pipeLines(service, proc.stderr, true);

  proc.exited.then((exitCode) => {
    children.delete(proc);
    logStatus(service, `exited with code ${exitCode}`);

    if (!shuttingDown) {
      void shutdown(exitCode === 0 ? 1 : exitCode);
    }
  });
}

async function runCodegen() {
  const service: Service = {
    name: "codegen",
    command: ["bun", "--bun", "run", "--cwd", "services/api", "codegen"],
    color: "\x1b[33m"
  };

  logStatus(service, `running: ${service.command.join(" ")}`);

  const proc = Bun.spawn({
    cmd: service.command,
    env: Bun.env,
    stdout: "pipe",
    stderr: "pipe"
  });

  void pipeLines(service, proc.stdout, false);
  void pipeLines(service, proc.stderr, true);

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    logStatus(service, `failed with code ${exitCode}`);
    process.exit(exitCode);
  }

  logStatus(service, "complete");
}

async function pipeLines(
  service: Service,
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
        logLine(service, line, isError);
      }
    }
  }

  if (buffer) {
    logLine(service, buffer, isError);
  }
}

function logLine(service: Service, line: string, isError: boolean) {
  const output = isError ? console.error : console.log;
  output(`${service.color}${service.name.padEnd(7)}${reset} ${line}`);
}

function logStatus(service: Service, message: string) {
  console.log(
    `${service.color}${service.name.padEnd(7)}${reset} ${dim}${message}${reset}`
  );
}

async function shutdown(exitCode: number) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`${dim}stopping dev services${reset}`);

  for (const child of children) {
    child.kill("SIGTERM");
  }

  await Promise.allSettled([...children].map((child) => child.exited));
  process.exit(exitCode);
}
