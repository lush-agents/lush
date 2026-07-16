import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createIsolatedTestDatabase } from "../packages/db/src/test";
import type { EmailDelivery, EmailMessage } from "../services/notifications/src/email";
import {
  createOrganizationInvite,
  respondToOrganizationInvite,
  type Principal
} from "../services/authz/src/runtime";

const databaseUrl = process.env.LUSH_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const appBaseUrl = "https://app.example.com";

if (!databaseUrl) {
  test.skip("organization invite tokens require a test database URL", () => {});
} else {
  describe("organization invite tokens", () => {
    let harness: Awaited<ReturnType<typeof createIsolatedTestDatabase>>;
    let db: Awaited<ReturnType<typeof createIsolatedTestDatabase>>["db"];

    beforeAll(async () => {
      harness = await createIsolatedTestDatabase(databaseUrl);
      db = harness.db;
    });

    afterAll(async () => {
      await harness?.destroy();
    });

    test("delivery, acceptance, and decline use a hashed single-use token", async () => {
      const delivery = new CaptureEmailDelivery();
      const now = new Date("2026-07-16T12:00:00.000Z");
      const organization = await insertOrganization(db, now);
      const admin = await insertPrincipal(db, {
        email: uniqueEmail(),
        organizationId: organization.id,
        role: "admin",
        now
      });
      const invitee = await insertPrincipal(db, {
        email: uniqueEmail(),
        organizationId: null,
        role: null,
        now
      });
      const otherUser = await insertPrincipal(db, {
        email: uniqueEmail(),
        organizationId: null,
        role: null,
        now
      });

      const created = await createOrganizationInvite(
        admin,
        { email: invitee.email, role: "user" },
        { db, emailDelivery: delivery, appBaseUrl, now }
      );
      const token = deliveredToken(delivery.messages[0]);
      const stored = await db
        .selectFrom("organizationInvites")
        .select(["tokenHash", "status", "respondedAt"])
        .where("id", "=", created.invite.id)
        .executeTakeFirstOrThrow();

      expect(delivery.messages[0]).toMatchObject({
        to: invitee.email,
        subject: `You're invited to ${organization.name} on Lush`
      });
      expect(stored.tokenHash).toBe(await hashSecret(token));
      expect(stored.tokenHash).not.toBe(token);
      expect(stored.status).toBe("pending");
      expect(stored.respondedAt).toBeNull();

      await expect(
        respondToOrganizationInvite(
          otherUser,
          { token, response: "accepted" },
          { db, now: new Date(now.getTime() + 1) }
        )
      ).rejects.toMatchObject({ code: "invite_email_mismatch" });

      const acceptedAt = new Date(now.getTime() + 2);
      const accepted = await respondToOrganizationInvite(
        invitee,
        { token, response: "accepted" },
        { db, now: acceptedAt }
      );
      expect(accepted).toMatchObject({
        invite: { status: "accepted", respondedAt: acceptedAt.toISOString() },
        organization
      });
      expect(
        await db
          .selectFrom("organizationMemberships")
          .select(["organizationId", "userId", "role"])
          .where("organizationId", "=", organization.id)
          .where("userId", "=", invitee.userId)
          .executeTakeFirstOrThrow()
      ).toEqual({
        organizationId: organization.id,
        userId: invitee.userId,
        role: "user"
      });
      await expect(
        respondToOrganizationInvite(
          invitee,
          { token, response: "accepted" },
          { db, now: new Date(now.getTime() + 3) }
        )
      ).rejects.toMatchObject({ code: "invalid_or_expired_invite" });

      const second = await createOrganizationInvite(
        admin,
        { email: invitee.email, role: "admin" },
        { db, emailDelivery: delivery, appBaseUrl, now: new Date(now.getTime() + 4) }
      );
      const secondToken = deliveredToken(delivery.messages[1]);
      const declinedAt = new Date(now.getTime() + 5);
      await expect(
        respondToOrganizationInvite(
          invitee,
          { token: secondToken, response: "declined" },
          { db, now: declinedAt }
        )
      ).resolves.toMatchObject({
        invite: {
          id: second.invite.id,
          status: "declined",
          respondedAt: declinedAt.toISOString()
        }
      });

      const auditActions = await db
        .selectFrom("auditEvents")
        .select("action")
        .where("targetType", "=", "organization_invite")
        .where("targetId", "in", [created.invite.id, second.invite.id])
        .orderBy("createdAt")
        .execute();
      expect(auditActions.map(({ action }) => action)).toEqual([
        "auth.organization_invite_created",
        "auth.organization_invite_accepted",
        "auth.organization_invite_created",
        "auth.organization_invite_declined"
      ]);
    });

    test("expired invites cannot be accepted", async () => {
      const delivery = new CaptureEmailDelivery();
      const now = new Date("2026-07-16T12:00:00.000Z");
      const organization = await insertOrganization(db, now);
      const admin = await insertPrincipal(db, {
        email: uniqueEmail(),
        organizationId: organization.id,
        role: "admin",
        now
      });
      const invitee = await insertPrincipal(db, {
        email: uniqueEmail(),
        organizationId: null,
        role: null,
        now
      });

      await createOrganizationInvite(
        admin,
        { email: invitee.email, role: "user", expiresInDays: 1 },
        { db, emailDelivery: delivery, appBaseUrl, now }
      );

      await expect(
        respondToOrganizationInvite(
          invitee,
          { token: deliveredToken(delivery.messages[0]), response: "accepted" },
          { db, now: new Date(now.getTime() + 86_400_000) }
        )
      ).rejects.toMatchObject({ code: "invalid_or_expired_invite" });
    });
  });
}

class CaptureEmailDelivery implements EmailDelivery {
  readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.messages.push(message);
  }
}

async function insertOrganization(
  db: Awaited<ReturnType<typeof createIsolatedTestDatabase>>["db"],
  now: Date
) {
  return db
    .insertInto("organizations")
    .values({
      name: `Invite Test ${crypto.randomUUID()}`,
      slug: `invite-test-${crypto.randomUUID()}`,
      createdAt: now,
      updatedAt: now
    })
    .returning(["id", "name"])
    .executeTakeFirstOrThrow();
}

async function insertPrincipal(
  db: Awaited<ReturnType<typeof createIsolatedTestDatabase>>["db"],
  options: {
    email: string;
    organizationId: string | null;
    role: "admin" | "user" | null;
    now: Date;
  }
): Promise<Principal & { email: string }> {
  const user = await db
    .insertInto("users")
    .values({
      email: options.email,
      emailVerified: true,
      displayName: "Invite Test User",
      avatarUrl: null,
      createdAt: options.now,
      updatedAt: options.now
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  const membership = options.organizationId
    ? await db
        .insertInto("organizationMemberships")
        .values({
          organizationId: options.organizationId,
          userId: user.id,
          role: options.role!,
          createdAt: options.now,
          updatedAt: options.now
        })
        .returning("id")
        .executeTakeFirstOrThrow()
    : null;
  const session = await db
    .insertInto("sessions")
    .values({
      userId: user.id,
      organizationId: options.organizationId,
      membershipId: membership?.id ?? null,
      tokenHash: crypto.randomUUID(),
      refreshFamilyHash: null,
      previousTokenHash: null,
      rotatedAt: null,
      userAgent: null,
      ipValue: null,
      ipMode: "off",
      lastSeenUserAgent: null,
      lastSeenIpValue: null,
      lastSeenIpMode: "off",
      createdAt: options.now,
      lastUsedAt: options.now,
      expiresAt: new Date(options.now.getTime() + 86_400_000),
      revokedAt: null
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return {
    userId: user.id,
    email: options.email,
    organizationId: options.organizationId,
    membershipId: membership?.id ?? null,
    role: options.role,
    sessionId: session.id
  };
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

async function hashSecret(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
