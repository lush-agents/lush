import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createIsolatedTestDatabase } from "../packages/db/src/test";
import type { EmailDelivery, EmailMessage } from "../services/notifications/src/email";
import {
  registerAccount,
  requestPasswordReset,
  resetPassword,
  verifyEmailAddress
} from "../services/authz/src/runtime";

const databaseUrl = process.env.LUSH_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const appBaseUrl = "https://app.example.com";

if (!databaseUrl) {
  test.skip("auth action tokens require a test database URL", () => {});
} else {
  describe("email verification and password reset tokens", () => {
    let harness: Awaited<ReturnType<typeof createIsolatedTestDatabase>>;
    let db: Awaited<ReturnType<typeof createIsolatedTestDatabase>>["db"];

    beforeAll(async () => {
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
  });
}

class CaptureEmailDelivery implements EmailDelivery {
  readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.messages.push(message);
  }
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
        ipHash: null,
        lastSeenUserAgent: null,
        lastSeenIpHash: null,
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
