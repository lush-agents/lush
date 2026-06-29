import { config as loadEnv } from "dotenv";
import { getDb } from "@lush/db/client";
import { AuthError, verifyEmailAddress } from "./runtime";

loadEnv({ path: "../../.env.development", override: false, quiet: true });

const email = process.argv[2];

if (!email) {
  console.error("Usage: bun run auth:verify-email -- user@example.com");
  process.exit(1);
}

try {
  const result = await verifyEmailAddress(email);
  console.log(`Verified ${result.email}`);
} catch (error) {
  if (error instanceof AuthError) {
    console.error(error.message);
    process.exit(error.status >= 500 ? 1 : error.status);
  }

  console.error(error instanceof Error ? error.message : "Unable to verify email");
  process.exit(1);
} finally {
  await getDb().destroy();
}
