import { expect, test } from "bun:test";
import {
  accessClaimsMatchSession,
  type AccessTokenClaims,
  type CurrentSession
} from "../services/authz/src/runtime";

const baseSession: CurrentSession = {
  sessionId: "session-1",
  user: {
    id: "user-1",
    email: "user@example.com",
    emailVerified: true,
    displayName: "User"
  },
  organization: {
    id: "org-1",
    name: "Acme"
  },
  membership: {
    id: "membership-1",
    role: "admin"
  },
  createdAt: "2026-06-29T00:00:00.000Z",
  expiresAt: "2026-07-29T00:00:00.000Z"
};

const baseClaims: AccessTokenClaims = {
  iss: "lush-authz",
  aud: "lush-api",
  sub: "user-1",
  sid: "session-1",
  org: "org-1",
  mid: "membership-1",
  role: "admin",
  email: "user@example.com",
  email_verified: true,
  name: "User",
  org_name: "Acme",
  session_created_at: "2026-06-29T00:00:00.000Z",
  session_expires_at: "2026-07-29T00:00:00.000Z",
  iat: 1,
  exp: 2,
  jti: "token-1"
};

test("access claims match the current backing session", () => {
  expect(accessClaimsMatchSession(baseClaims, baseSession)).toBe(true);
});

test("access claims stop matching when a role changes", () => {
  expect(
    accessClaimsMatchSession(baseClaims, {
      ...baseSession,
      membership: {
        id: "membership-1",
        role: "user"
      }
    })
  ).toBe(false);
});

test("access claims stop matching when membership is removed", () => {
  expect(
    accessClaimsMatchSession(baseClaims, {
      ...baseSession,
      membership: null
    })
  ).toBe(false);
});

test("access claims stop matching when user or organization display state changes", () => {
  expect(
    accessClaimsMatchSession(baseClaims, {
      ...baseSession,
      organization: {
        id: "org-1",
        name: "Renamed"
      }
    })
  ).toBe(false);

  expect(
    accessClaimsMatchSession(baseClaims, {
      ...baseSession,
      user: {
        ...baseSession.user,
        displayName: "Renamed User"
      }
    })
  ).toBe(false);
});
