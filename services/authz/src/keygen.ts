import {
  formatJwtKeyEnv,
  generateJwtKeyPair,
  JwtKeyConfigError
} from "./jwt-keys";

const args = process.argv.slice(2);
const keyId = args.length === 2 && args[0] === "--kid" ? args[1] : undefined;

if (args.length !== 0 && keyId === undefined) {
  console.error("usage: bun run auth:keygen [-- --kid <key-id>]");
  process.exit(1);
}

try {
  console.log(formatJwtKeyEnv(await generateJwtKeyPair(keyId)));
} catch (error) {
  if (error instanceof JwtKeyConfigError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
