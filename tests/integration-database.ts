type IntegrationTestEnv = {
  CI?: string;
  DATABASE_URL?: string;
  LUSH_TEST_DATABASE_URL?: string;
};

export function integrationDatabaseUrl(
  env: IntegrationTestEnv = process.env
): string | undefined {
  const dedicatedUrl = env.LUSH_TEST_DATABASE_URL?.trim();
  if (dedicatedUrl) {
    return dedicatedUrl;
  }

  if (env.CI === "true") {
    throw new Error(
      "LUSH_TEST_DATABASE_URL is required in CI; database integration tests must not be skipped"
    );
  }

  return env.DATABASE_URL?.trim() || undefined;
}
