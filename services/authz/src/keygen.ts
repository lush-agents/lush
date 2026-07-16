import {
  formatJwtKeyEnv,
  generateJwtKeyPair,
  JwtKeyConfigError,
  parseJwtRsaModulusLength,
  type JwtRsaModulusLength
} from "./jwt-keys";

const args = process.argv.slice(2);

try {
  const options = parseArgs(args);
  console.log(
    formatJwtKeyEnv(
      await generateJwtKeyPair(options.keyId, options.modulusLength)
    )
  );
} catch (error) {
  if (error instanceof JwtKeyConfigError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

function parseArgs(args: string[]) {
  let keyId: string | undefined;
  let modulusLength: JwtRsaModulusLength = 3072;

  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value || (flag !== "--kid" && flag !== "--bits")) {
      throw new JwtKeyConfigError(
        "usage: bun run auth:keygen [-- --kid <key-id>] [--bits 2048|3072|4096]"
      );
    }
    if (flag === "--kid") {
      keyId = value;
    } else {
      modulusLength = parseJwtRsaModulusLength(value);
    }
  }

  return { keyId, modulusLength };
}
