import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createIsolatedTestDatabase } from "../packages/db/src/test";
import type { EmailDelivery, EmailMessage } from "../services/notifications/src/email";
import {
  login,
  registerAccount,
  requestPasswordReset,
  resetPassword,
  verifyEmailAddress
} from "../services/authz/src/runtime";
import { verifyPassword } from "../services/authz/src/password";
import { generateJwtKeyPair } from "../services/authz/src/jwt-keys";
import { integrationDatabaseUrl } from "./integration-database";

const databaseUrl = integrationDatabaseUrl();
const appBaseUrl = "https://app.example.com";

if (!databaseUrl) {
  test.skip("auth action tokens require a test database URL", () => {});
} else {
  describe("email verification and password reset tokens", () => {
    let harness: Awaited<ReturnType<typeof createIsolatedTestDatabase>>;
    let db: Awaited<ReturnType<typeof createIsolatedTestDatabase>>["db"];

    beforeAll(async () => {
      const jwtKeys = await generateJwtKeyPair("integration-test", 2048);
      process.env.LUSH_SECRET_KEY = "integration-test-auth-secret";
      process.env.LUSH_AUTH_JWT_KEY_ID = jwtKeys.keyId;
      process.env.LUSH_AUTH_JWT_PRIVATE_KEY = jwtKeys.privateKeyPem;
      process.env.LUSH_AUTH_JWT_PUBLIC_KEYS = JSON.stringify({
        [jwtKeys.keyId]: jwtKeys.publicKeyPem
      });
      harness = await createIsolatedTestDatabase(databaseUrl);
      db = harness.db;
    });

    afterAll(async () => {
      await harness?.destroy();
    });

    test("verification tokens are hashed, expiring, and single-use", async () => {
      const delivery = new CaptureEmailDelivery();
      const now = new Date("2026-07-15T12:00:00.000Z");
      const email = uniqueEmail();
      await registerAccount(
        { email, password: "initial-password" },
        {},
        { db, emailDelivery: delivery, appBaseUrl, now }
      );

      const token = deliveredToken(delivery.messages[0]);
      const tokenHash = await hashSecret(token);
      const stored = await db
        .selectFrom("authActionTokens")
        .select(["tokenHash", "expiresAt", "usedAt"])
        .where("tokenHash", "=", tokenHash)
        .executeTakeFirstOrThrow();
      expect(stored.tokenHash).toBe(tokenHash);
      expect(stored.tokenHash).not.toBe(token);
      expect(stored.expiresAt).toEqual(new Date("2026-07-16T12:00:00.000Z"));
      expect(stored.usedAt).toBeNull();

      await verifyEmailAddress({ token }, { db, now: new Date(now.getTime() + 1) });
      expect(
        (
          await db
            .selectFrom("users")
            .select("emailVerified")
            .where("email", "=", email)
            .executeTakeFirstOrThrow()
        ).emailVerified
      ).toBe(true);
      await expect(verifyEmailAddress({ token }, { db })).rejects.toMatchObject({
        code: "invalid_or_expired_token"
      });
    });

    test("re-registration supersedes an unverified password account", async () => {
      const delivery = new CaptureEmailDelivery();
      const email = uniqueEmail();
      await registerAccount(
        { email, password: "first-password", displayName: "First" },
        {},
        { db, emailDelivery: delivery, appBaseUrl }
      );
      const firstToken = deliveredToken(delivery.messages[0]);

      await registerAccount(
        { email, password: "second-password", displayName: "Second" },
        {},
        { db, emailDelivery: delivery, appBaseUrl }
      );
      const secondToken = deliveredToken(delivery.messages[1]);

      expect(
        await db.selectFrom("users").select("id").where("email", "=", email).execute()
      ).toHaveLength(1);
      expect(
        (
          await db
            .selectFrom("users")
            .select("displayName")
            .where("email", "=", email)
            .executeTakeFirstOrThrow()
        ).displayName
      ).toBe("Second");
      await expect(
        verifyEmailAddress({ token: firstToken }, { db })
      ).rejects.toMatchObject({ code: "invalid_or_expired_token" });
      await expect(
        verifyEmailAddress({ token: secondToken }, { db })
      ).resolves.toEqual({ ok: true });
    });

    test("public registration hides existing verified accounts", async () => {
      const delivery = new CaptureEmailDelivery();
      const email = uniqueEmail();
      const response = await registerAccount(
        { email, password: "initial-password" },
        {},
        { db, emailDelivery: delivery, appBaseUrl }
      );
      await verifyEmailAddress(
        { token: deliveredToken(delivery.messages[0]) },
        { db }
      );

      await expect(
        registerAccount(
          { email, password: "replacement-password" },
          {},
          { db, emailDelivery: delivery, appBaseUrl }
        )
      ).resolves.toEqual(response);
      expect(delivery.messages).toHaveLength(2);
      expect(delivery.messages[1]).toMatchObject({
        to: email,
        subject: "A Lush account already exists for this email"
      });
      expect(delivery.messages[1]?.text).toContain("https://app.example.com/sign-in");
      expect(delivery.messages[1]?.text).not.toContain("token=");
    });

    test("private registration reports existing verified accounts", async () => {
      const delivery = new CaptureEmailDelivery();
      const email = uniqueEmail();
      await registerAccount(
        { email, password: "initial-password" },
        {},
        { db, emailDelivery: delivery, appBaseUrl, publicSignup: false }
      );
      await verifyEmailAddress(
        { token: deliveredToken(delivery.messages[0]) },
        { db }
      );

      await expect(
        registerAccount(
          { email, password: "replacement-password" },
          {},
          { db, emailDelivery: delivery, appBaseUrl, publicSignup: false }
        )
      ).rejects.toMatchObject({ code: "email_in_use" });
      expect(delivery.messages).toHaveLength(1);
    });

    test("unknown-email, wrong-password, and unverified-account logins return the same error", async () => {
      const delivery = new CaptureEmailDelivery();
      const email = uniqueEmail();
      await registerAccount(
        { email, password: "correct-password" },
        {},
        { db, emailDelivery: delivery, appBaseUrl }
      );

      const wrongPassword = login(
        { email, password: "wrong-password" },
        {},
        { db }
      ).catch((error) => error);
      const unknownEmail = login(
        { email: uniqueEmail(), password: "wrong-password" },
        {},
        { db }
      ).catch((error) => error);
      const unverifiedAccount = login(
        { email, password: "correct-password" },
        {},
        { db }
      ).catch((error) => error);

      await expect(wrongPassword).resolves.toMatchObject({
        code: "invalid_credentials",
        message:
          "Invalid email or password. If you recently signed up, check your inbox for a verification link or register again to resend it.",
        status: 401
      });
      await expect(unknownEmail).resolves.toMatchObject({
        code: "invalid_credentials",
        message:
          "Invalid email or password. If you recently signed up, check your inbox for a verification link or register again to resend it.",
        status: 401
      });
      await expect(unverifiedAccount).resolves.toMatchObject({
        code: "invalid_credentials",
        message:
          "Invalid email or password. If you recently signed up, check your inbox for a verification link or register again to resend it.",
        status: 401
      });
    });

    test("successful login upgrades a legacy PBKDF2 credential", async () => {
      const delivery = new CaptureEmailDelivery();
      const email = uniqueEmail();
      await registerAccount(
        { email, password: "initial-password" },
        {},
        { db, emailDelivery: delivery, appBaseUrl }
      );
      await verifyEmailAddress(
        { token: deliveredToken(delivery.messages[0]) },
        { db }
      );
      const user = await db
        .selectFrom("users")
        .select("id")
        .where("email", "=", email)
        .executeTakeFirstOrThrow();
      const legacyPasswordHash =
        "pbkdf2-sha256$210000$00000000000000000000000000000000$0874caac5987c61b6f423794064371a0532243af7fb62697cac9fc97e90c0341";
      await db
        .updateTable("passwordCredentials")
        .set({ passwordHash: legacyPasswordHash })
        .where("userId", "=", user.id)
        .execute();

      await expect(
        login({ email, password: "legacy-password" }, {}, { db })
      ).resolves.toHaveProperty("refreshToken");

      const upgradedHash = (
        await db
          .selectFrom("passwordCredentials")
          .select("passwordHash")
          .where("userId", "=", user.id)
          .executeTakeFirstOrThrow()
      ).passwordHash;
      expect(upgradedHash).toStartWith("$argon2id$");
      await expect(verifyPassword("legacy-password", upgradedHash)).resolves.toBe(
        true
      );
    });

    test("password reset consumes its token and revokes every session", async () => {
      const delivery = new CaptureEmailDelivery();
      const email = uniqueEmail();
      await registerAccount(
        { email, password: "initial-password" },
        {},
        { db, emailDelivery: delivery, appBaseUrl }
      );
      await verifyEmailAddress(
        { token: deliveredToken(delivery.messages[0]) },
        { db }
      );
      const user = await db
        .selectFrom("users")
        .select("id")
        .where("email", "=", email)
        .executeTakeFirstOrThrow();
      const passwordBefore = (
        await db
          .selectFrom("passwordCredentials")
          .select("passwordHash")
          .where("userId", "=", user.id)
          .executeTakeFirstOrThrow()
      ).passwordHash;
      await insertSession(db, user.id);
      await insertSession(db, user.id);

      await requestPasswordReset(
        { email },
        {},
        { db, emailDelivery: delivery, appBaseUrl }
      );
      await waitForMessageCount(delivery, 2);
      const resetToken = deliveredToken(delivery.messages[1]);
      await resetPassword({ token: resetToken, password: "replacement-password" }, { db });

      const sessions = await db
        .selectFrom("sessions")
        .select("revokedAt")
        .where("userId", "=", user.id)
        .execute();
      expect(sessions).toHaveLength(2);
      expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);
      expect(
        (
          await db
            .selectFrom("passwordCredentials")
            .select("passwordHash")
            .where("userId", "=", user.id)
            .executeTakeFirstOrThrow()
        ).passwordHash
      ).not.toBe(passwordBefore);
      await expect(
        resetPassword({ token: resetToken, password: "another-password" }, { db })
      ).rejects.toMatchObject({ code: "invalid_or_expired_token" });
    });

    test("expired action tokens are rejected", async () => {
      const delivery = new CaptureEmailDelivery();
      const now = new Date("2026-07-15T12:00:00.000Z");
      await registerAccount(
        { email: uniqueEmail(), password: "initial-password" },
        {},
        { db, emailDelivery: delivery, appBaseUrl, now }
      );

      await expect(
        verifyEmailAddress(
          { token: deliveredToken(delivery.messages[0]) },
          { db, now: new Date(now.getTime() + 24 * 60 * 60 * 1000 + 1) }
        )
      ).rejects.toMatchObject({ code: "invalid_or_expired_token" });
    });

    test("password-reset requests do not reveal unknown accounts", async () => {
      const delivery = new CaptureEmailDelivery();
      await expect(
        requestPasswordReset(
          { email: uniqueEmail() },
          {},
          { db, emailDelivery: delivery, appBaseUrl }
        )
      ).resolves.toEqual({ ok: true });
      expect(delivery.messages).toHaveLength(0);
    });

    test("password-reset responses do not await email delivery", async () => {
      const setupDelivery = new CaptureEmailDelivery();
      const email = uniqueEmail();
      await registerAccount(
        { email, password: "initial-password" },
        {},
        { db, emailDelivery: setupDelivery, appBaseUrl }
      );
      await verifyEmailAddress(
        { token: deliveredToken(setupDelivery.messages[0]) },
        { db }
      );

      const delivery = new DeferredEmailDelivery();
      await expect(
        requestPasswordReset(
          { email },
          {},
          { db, emailDelivery: delivery, appBaseUrl }
        )
      ).resolves.toEqual({ ok: true });
      await Promise.race([
        delivery.started,
        Bun.sleep(1_000).then(() => {
          throw new Error("Background delivery did not start");
        })
      ]);
      expect(delivery.completed).toBe(false);
    });

    test("password-reset delivery failures do not change the public response", async () => {
      const setupDelivery = new CaptureEmailDelivery();
      const email = uniqueEmail();
      await registerAccount(
        { email, password: "initial-password" },
        {},
        { db, emailDelivery: setupDelivery, appBaseUrl }
      );
      await verifyEmailAddress(
        { token: deliveredToken(setupDelivery.messages[0]) },
        { db }
      );

      const delivery = new FailingEmailDelivery();
      await expect(
        requestPasswordReset(
          { email },
          {},
          { db, emailDelivery: delivery, appBaseUrl }
        )
      ).resolves.toEqual({ ok: true });
      await delivery.attempted;
      await Promise.resolve();
    });
  });
}

class CaptureEmailDelivery implements EmailDelivery {
  readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.messages.push(message);
  }
}

class DeferredEmailDelivery implements EmailDelivery {
  completed = false;
  private start!: () => void;
  readonly started = new Promise<void>((resolve) => {
    this.start = resolve;
  });

  async send() {
    this.start();
    await new Promise<void>(() => {});
    this.completed = true;
  }
}

class FailingEmailDelivery implements EmailDelivery {
  private markAttempted!: () => void;
  readonly attempted = new Promise<void>((resolve) => {
    this.markAttempted = resolve;
  });

  async send() {
    this.markAttempted();
    throw new Error("simulated SMTP failure");
  }
}

async function waitForMessageCount(
  delivery: CaptureEmailDelivery,
  count: number
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (delivery.messages.length >= count) return;
    await Bun.sleep(1);
  }
  throw new Error(`Expected ${count} delivered messages`);
}

function deliveredToken(message: EmailMessage | undefined) {
  expect(message).toBeDefined();
  const link = message!.text.match(/https:\/\/\S+/)?.[0];
  expect(link).toBeDefined();
  return new URL(link!).searchParams.get("token")!;
}

function uniqueEmail() {
  return `${crypto.randomUUID()}@example.com`;
}

async function insertSession(
  db: Awaited<ReturnType<typeof createIsolatedTestDatabase>>["db"],
  userId: string
) {
  const now = new Date();
  await db
      .insertInto("sessions")
      .values({
        userId,
        organizationId: null,
        membershipId: null,
        tokenHash: await hashSecret(crypto.randomUUID()),
        refreshFamilyHash: null,
        previousTokenHash: null,
        rotatedAt: null,
        userAgent: null,
        ipValue: null,
        ipMode: null,
        lastSeenUserAgent: null,
        lastSeenIpValue: null,
        lastSeenIpMode: null,
        createdAt: now,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + 60_000),
        revokedAt: null
      })
      .execute();
}

async function hashSecret(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
