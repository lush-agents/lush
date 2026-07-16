import { config as loadEnv } from "dotenv";
import { getDb } from "@lush/db/client";
import { createLogger } from "@lush/logging/logger";
import { AuthError, verifyEmailAddressByOperator } from "./runtime";

loadEnv({ path: "../../.env.development", override: false, quiet: true });

const logger = createLogger("@lush/authz");
const email = process.argv[2];

if (!email) {
  logger.error(
    { usage: "bun run auth:verify-email -- user@example.com" },
    "email argument required"
  );
  process.exit(1);
}

try {
  const result = await verifyEmailAddressByOperator(email);
  logger.info({ email: result.email }, "email verified");
} catch (error) {
  if (error instanceof AuthError) {
    logger.error({ err: error, code: error.code }, "email verification failed");
    process.exit(error.status >= 500 ? 1 : error.status);
  }

  logger.error({ err: error }, "email verification failed");
  process.exit(1);
} finally {
  await getDb().destroy();
}
