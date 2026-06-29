import { config as loadEnv } from "dotenv";
import { ensureDevEnvFile } from "./env";
import { ProcessManager, type ProcessManagerConfig } from "./process-manager";

const devEnv = await ensureDevEnvFile();
if (devEnv.created) {
  console.log(`generated ${devEnv.path} from .env.template`);
}

loadEnv({ path: ".env.development", override: true, quiet: true });

const config = (await Bun.file("scripts/dev/config.json").json()) as ProcessManagerConfig;
const manager = new ProcessManager(config);

manager.installSignalHandlers();
await manager.start();
