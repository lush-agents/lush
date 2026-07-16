import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createIsolatedTestDatabase } from "../packages/db/src/test";
import {
  createRefreshToken,
  refreshTokenFamilySecret
} from "../services/authz/src/refresh-token";
import { rotateRefreshSession } from "../services/authz/src/runtime";
import { retainedSessionIp } from "../services/authz/src/session-ip";
import { integrationDatabaseUrl } from "./integration-database";

const databaseUrl = integrationDatabaseUrl();
const signingSecret = "integration-test-refresh-signing-secret";

if (!databaseUrl) {
  test.skip("refresh rotation transaction requires a test database URL", () => {});
} else {
  describe("refresh rotation transaction", () => {
    let harness: Awaited<ReturnType<typeof createIsolatedTestDatabase>>;
    let db: Awaited<ReturnType<typeof createIsolatedTestDatabase>>["db"];

    beforeAll(async () => {
      harness = await createIsolatedTestDatabase(databaseUrl);
      db = harness.db;
    });

    afterAll(async () => {
      await harness?.destroy();
    });

    test("concurrent previous-token use converges, while older reuse revokes and audits", async () => {
      const initial = await createRefreshToken(signingSecret);
      const sessionId = await insertSession(db, initial, {
        userAgent: "created-agent",
        ipAddress: "192.0.2.1"
      });

      const rotations = await Promise.all(
        Array.from({ length: 5 }, () =>
          rotateRefreshSession(
            initial,
            { userAgent: "refresh-agent", ipAddress: "198.51.100.2" },
            { db, graceMs: 60_000, signingSecret }
          )
        )
      );
      const successor = rotations[0]?.refreshToken;

      expect(successor).toBeDefined();
      expect(new Set(rotations.map((rotation) => rotation?.refreshToken)).size)
        .toBe(1);

      const afterConcurrentRefresh = await db
        .selectFrom("sessions")
        .selectAll()
        .where("id", "=", sessionId)
        .executeTakeFirstOrThrow();
      expect(afterConcurrentRefresh.tokenHash).toBe(await hashSecret(successor!));
      expect(afterConcurrentRefresh.previousTokenHash).toBe(
        await hashSecret(initial)
      );
      expect(afterConcurrentRefresh.revokedAt).toBeNull();
      expect(afterConcurrentRefresh.userAgent).toBe("created-agent");
      const creationIp = await retainedSessionIp("192.0.2.1", {
        hmacKey: signingSecret
      });
      const refreshedIp = await retainedSessionIp("198.51.100.2", {
        hmacKey: signingSecret
      });
      expect(afterConcurrentRefresh.ipValue).toBe(creationIp.value);
      expect(afterConcurrentRefresh.ipMode).toBe(creationIp.mode);
      expect(afterConcurrentRefresh.lastSeenUserAgent).toBe("refresh-agent");
      expect(afterConcurrentRefresh.lastSeenIpValue).toBe(refreshedIp.value);
      expect(afterConcurrentRefresh.lastSeenIpMode).toBe(refreshedIp.mode);

      const next = await rotateRefreshSession(
        successor!,
        { userAgent: "next-agent", ipAddress: "203.0.113.3" },
        { db, graceMs: 60_000, signingSecret }
      );
      expect(next?.refreshToken).not.toBe(successor);

      expect(
        await rotateRefreshSession(
          initial,
          { userAgent: "reuse-agent", ipAddress: "203.0.113.99" },
          { db, graceMs: 60_000, signingSecret }
        )
      ).toBeUndefined();

      const revoked = await db
        .selectFrom("sessions")
        .select("revokedAt")
        .where("id", "=", sessionId)
        .executeTakeFirstOrThrow();
      expect(revoked.revokedAt).not.toBeNull();

      const audit = await db
        .selectFrom("auditEvents")
        .select(["action", "sessionId", "metadata"])
        .where("sessionId", "=", sessionId)
        .executeTakeFirstOrThrow();
      expect(audit.action).toBe("auth.refresh_token_reused");
      const reusedIp = await retainedSessionIp("203.0.113.99", {
        hmacKey: signingSecret
      });
      expect(audit.metadata).toEqual({
        ipValue: reusedIp.value,
        ipMode: reusedIp.mode,
        userAgent: "reuse-agent"
      });
    });

    test("previous-token grace expires", async () => {
      const initial = await createRefreshToken(signingSecret);
      const sessionId = await insertSession(db, initial);
      expect(
        await rotateRefreshSession(initial, {}, { db, graceMs: 60_000, signingSecret })
      ).toBeDefined();

      await db
        .updateTable("sessions")
        .set({ rotatedAt: new Date(Date.now() - 61_000) })
        .where("id", "=", sessionId)
        .execute();

      expect(
        await rotateRefreshSession(initial, {}, { db, graceMs: 60_000, signingSecret })
      ).toBeUndefined();
      expect(
        (
          await db
            .selectFrom("sessions")
            .select("revokedAt")
            .where("id", "=", sessionId)
            .executeTakeFirstOrThrow()
        ).revokedAt
      ).not.toBeNull();
    });

    test("signing-secret rotation rejects grace replay without a theft signal", async () => {
      const initial = await createRefreshToken(signingSecret);
      const sessionId = await insertSession(db, initial);
      const rotated = await rotateRefreshSession(
        initial,
        {},
        { db, graceMs: 60_000, signingSecret }
      );
      expect(rotated?.refreshToken).toBeDefined();

      expect(
        await rotateRefreshSession(
          initial,
          {},
          { db, graceMs: 60_000, signingSecret: "rotated-signing-secret" }
        )
      ).toBeUndefined();

      expect(
        (
          await db
            .selectFrom("sessions")
            .select("revokedAt")
            .where("id", "=", sessionId)
            .executeTakeFirstOrThrow()
        ).revokedAt
      ).toBeNull();
      expect(
        await db
          .selectFrom("auditEvents")
          .select("id")
          .where("sessionId", "=", sessionId)
          .execute()
      ).toHaveLength(0);

      expect(
        await rotateRefreshSession(
          rotated!.refreshToken,
          {},
          { db, graceMs: 60_000, signingSecret: "rotated-signing-secret" }
        )
      ).toBeDefined();
    });

    test("expired sessions are revoked without rotating", async () => {
      const initial = await createRefreshToken(signingSecret);
      const sessionId = await insertSession(db, initial, {
        expiresAt: new Date(Date.now() - 1_000)
      });

      expect(
        await rotateRefreshSession(initial, {}, { db, graceMs: 60_000, signingSecret })
      ).toBeUndefined();
      expect(
        (
          await db
            .selectFrom("sessions")
            .select("revokedAt")
            .where("id", "=", sessionId)
            .executeTakeFirstOrThrow()
        ).revokedAt
      ).not.toBeNull();
    });

    test("legacy tokens complete a database-backed rotation", async () => {
      const legacyToken = "legacy-refresh-token";
      const sessionId = await insertSession(db, legacyToken, {
        refreshFamilyHash: null
      });

      const rotated = await rotateRefreshSession(
        legacyToken,
        {},
        { db, graceMs: 60_000, signingSecret }
      );
      expect(rotated?.refreshToken).toBeDefined();
      expect(refreshTokenFamilySecret(rotated!.refreshToken)).toBe(legacyToken);

      const row = await db
        .selectFrom("sessions")
        .select(["tokenHash", "refreshFamilyHash", "previousTokenHash"])
        .where("id", "=", sessionId)
        .executeTakeFirstOrThrow();
      expect(row.tokenHash).toBe(await hashSecret(rotated!.refreshToken));
      expect(row.refreshFamilyHash).toBe(await hashSecret(legacyToken));
      expect(row.previousTokenHash).toBe(await hashSecret(legacyToken));

      expect(
        (
          await rotateRefreshSession(
            legacyToken,
            {},
            { db, graceMs: 60_000, signingSecret }
          )
        )?.refreshToken
      ).toBe(rotated!.refreshToken);
    });
  });
}

async function insertSession(
  db: Awaited<ReturnType<typeof createIsolatedTestDatabase>>["db"],
  refreshToken: string,
  options: {
    expiresAt?: Date;
    refreshFamilyHash?: string | null;
    userAgent?: string;
    ipAddress?: string;
  } = {}
) {
  const now = new Date();
  const user = await db
    .insertInto("users")
    .values({
      email: `${crypto.randomUUID()}@example.com`,
      emailVerified: true,
      displayName: "Refresh Test",
      avatarUrl: null,
      createdAt: now,
      updatedAt: now
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  const retainedIp = await retainedSessionIp(options.ipAddress, {
    hmacKey: signingSecret
  });
  const row = await db
    .insertInto("sessions")
    .values({
      userId: user.id,
      organizationId: null,
      membershipId: null,
      tokenHash: await hashSecret(refreshToken),
      refreshFamilyHash:
        options.refreshFamilyHash === undefined
          ? await hashSecret(refreshTokenFamilySecret(refreshToken))
          : options.refreshFamilyHash,
      previousTokenHash: null,
      rotatedAt: null,
      userAgent: options.userAgent ?? null,
      ipValue: retainedIp.value,
      ipMode: retainedIp.mode,
      lastSeenUserAgent: options.userAgent ?? null,
      lastSeenIpValue: retainedIp.value,
      lastSeenIpMode: retainedIp.mode,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: options.expiresAt ?? new Date(now.getTime() + 86_400_000),
      revokedAt: null
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
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
