import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createIsolatedTestDatabase } from "../packages/db/src/test";
import {
  switchOrganization,
  type Principal
} from "../services/authz/src/runtime";

const databaseUrl =
  process.env.LUSH_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  test.skip("organization session transactions require a test database URL", () => {});
} else {
  describe("organization session transactions", () => {
    let harness: Awaited<ReturnType<typeof createIsolatedTestDatabase>>;
    let db: Awaited<ReturnType<typeof createIsolatedTestDatabase>>["db"];

    beforeAll(async () => {
      harness = await createIsolatedTestDatabase(databaseUrl);
      db = harness.db;
    });

    afterAll(async () => {
      await harness?.destroy();
    });

    test("switching organizations preserves the current session when replacement creation fails", async () => {
      const now = new Date();
      const user = await db
        .insertInto("users")
        .values({
          email: `${crypto.randomUUID()}@example.com`,
          emailVerified: false,
          displayName: "Organization Switch Test",
          avatarUrl: null,
          createdAt: now,
          updatedAt: now
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      const organizations = await db
        .insertInto("organizations")
        .values([
          {
            name: "Current Organization",
            slug: `current-${crypto.randomUUID()}`,
            createdAt: now,
            updatedAt: now
          },
          {
            name: "Target Organization",
            slug: `target-${crypto.randomUUID()}`,
            createdAt: now,
            updatedAt: now
          }
        ])
        .returning("id")
        .execute();
      const memberships = await db
        .insertInto("organizationMemberships")
        .values(
          organizations.map((organization) => ({
            organizationId: organization.id,
            userId: user.id,
            role: "admin" as const,
            createdAt: now,
            updatedAt: now
          }))
        )
        .returning(["id", "organizationId"])
        .execute();
      const currentMembership = memberships[0]!;
      const targetMembership = memberships[1]!;
      const currentSession = await db
        .insertInto("sessions")
        .values({
          userId: user.id,
          organizationId: currentMembership.organizationId,
          membershipId: currentMembership.id,
          tokenHash: crypto.randomUUID(),
          refreshFamilyHash: crypto.randomUUID(),
          previousTokenHash: null,
          rotatedAt: null,
          userAgent: null,
          ipValue: null,
          ipMode: "off",
          lastSeenUserAgent: null,
          lastSeenIpValue: null,
          lastSeenIpMode: "off",
          createdAt: now,
          lastUsedAt: now,
          expiresAt: new Date(now.getTime() + 86_400_000),
          revokedAt: null
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      const principal: Principal = {
        userId: user.id,
        organizationId: currentMembership.organizationId,
        membershipId: currentMembership.id,
        role: "admin",
        sessionId: currentSession.id
      };

      await expect(
        switchOrganization(
          principal,
          { organizationId: targetMembership.organizationId },
          {},
          { db }
        )
      ).rejects.toMatchObject({ code: "email_not_verified" });

      expect(
        (
          await db
            .selectFrom("sessions")
            .select("revokedAt")
            .where("id", "=", currentSession.id)
            .executeTakeFirstOrThrow()
        ).revokedAt
      ).toBeNull();
      expect(
        await db
          .selectFrom("sessions")
          .select("id")
          .where("userId", "=", user.id)
          .execute()
      ).toHaveLength(1);
    });
  });
}
