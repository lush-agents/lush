import { describe, expect, test } from "bun:test";
import {
  ApiError,
  type AccessSession
} from "../packages/api-client/src/generated";
import {
  normalizeAccessSession,
  parseAccessTokenClaims,
  readCachedAccessSession,
  refreshAccessSession,
  withTokenRefresh,
  writeCachedAccessSession
} from "../apps/lush/src/lib/api-session";

describe("app api session helper", () => {
  test("parses organization claims from an access token", () => {
    const token = tokenWithClaims({
      org: "org-1",
      mid: "member-1",
      role: "admin",
      org_name: "Acme"
    });

    expect(parseAccessTokenClaims(token)).toMatchObject({
      sub: "user-1",
      org: "org-1",
      role: "admin",
      org_name: "Acme"
    });
  });

  test("normalizes access-token expiration from jwt claims", () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    const accessSession = sessionWithToken(tokenWithClaims({ exp }));

    expect(normalizeAccessSession(accessSession).accessSession.accessTokenExpiresAt)
      .toBe(new Date(exp * 1000).toISOString());
  });

  test("stores and reads valid access sessions from browser session storage", () => {
    const storage = new MemoryStorage();
    const accessSession = sessionWithToken(
      tokenWithClaims({ exp: Math.floor(Date.now() / 1000) + 600 }),
      Date.now() + 600_000
    );

    writeCachedAccessSession(accessSession, storage);

    expect(readCachedAccessSession(storage)).toEqual(accessSession);
  });

  test("clears invalid or nearly-expired cached access sessions", () => {
    const storage = new MemoryStorage();
    storage.setItem("lush:access-session", "{");

    expect(readCachedAccessSession(storage)).toBeUndefined();
    expect(storage.getItem("lush:access-session")).toBeNull();

    writeCachedAccessSession(
      sessionWithToken(
        tokenWithClaims({ exp: Math.floor(Date.now() / 1000) + 30 }),
        Date.now() + 30_000
      ),
      storage
    );

    expect(storage.getItem("lush:access-session")).toBeNull();
  });

  test("refreshes once and retries on unauthorized api errors", async () => {
    const initial = sessionWithToken(tokenWithClaims({ org: "old-org" }));
    const refreshed = sessionWithToken(tokenWithClaims({ org: "new-org" }));
    const applied: AccessSession[] = [];
    const seenTokens: string[] = [];

    const result = await withTokenRefresh(
      {
        apiBaseUrl: "http://api.test",
        accessSession: initial,
        applySession: (accessSession) => applied.push(accessSession),
        refreshAccessSession: async () => {
          applied.push(refreshed);
          return refreshed;
        }
      },
      async (accessSession) => {
        seenTokens.push(accessSession.accessToken);
        if (seenTokens.length === 1) {
          throw new ApiError("testRoute", 401, "", "unauthorized");
        }

        return "ok";
      }
    );

    expect(result).toBe("ok");
    expect(seenTokens).toEqual([initial.accessToken, refreshed.accessToken]);
    expect(applied).toEqual([refreshed]);
  });

  test("does not refresh on non-auth api errors", async () => {
    const initial = sessionWithToken(tokenWithClaims({}));
    let refreshed = false;

    await expect(
      withTokenRefresh(
        {
          apiBaseUrl: "http://api.test",
          accessSession: initial,
          applySession: () => undefined,
          refreshAccessSession: async () => {
            refreshed = true;
            return initial;
          }
        },
        async () => {
          throw new ApiError("testRoute", 403, "", "forbidden");
        }
      )
    ).rejects.toThrow("forbidden");

    expect(refreshed).toBe(false);
  });

  test("single-flights concurrent refresh requests", async () => {
    const refreshed = sessionWithToken(tokenWithClaims({ org: "new-org" }));
    const applied: AccessSession[] = [];
    let requests = 0;
    let resolveRequest: ((session: AccessSession) => void) | undefined;
    const requestRefresh = async () => {
      requests += 1;
      return new Promise<AccessSession>((resolve) => {
        resolveRequest = resolve;
      });
    };

    const first = refreshAccessSession(
      "http://single-flight.test",
      (session) => applied.push(session),
      requestRefresh
    );
    const second = refreshAccessSession(
      "http://single-flight.test",
      (session) => applied.push(session),
      requestRefresh
    );

    expect(requests).toBe(1);
    resolveRequest?.(refreshed);
    expect(await Promise.all([first, second])).toEqual([refreshed, refreshed]);
    expect(applied).toEqual([refreshed, refreshed]);
  });
});

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

function sessionWithToken(
  accessToken: string,
  expiresAtMs = Date.now() + 120_000
): AccessSession {
  return {
    accessToken,
    accessTokenExpiresAt: new Date(expiresAtMs).toISOString(),
    session: {
      sessionId: "session-1",
      user: {
        id: "user-1",
        email: "user@example.com",
        emailVerified: true,
        displayName: "User"
      },
      organization: null,
      membership: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString()
    }
  };
}

function tokenWithClaims(
  overrides: Partial<{
    sub: string;
    sid: string;
    org: string | null;
    mid: string | null;
    role: "admin" | "user" | null;
    email: string;
    name: string;
    org_name: string;
    exp: number;
  }>
) {
  const claims = {
    sub: "user-1",
    sid: "session-1",
    org: null,
    mid: null,
    role: null,
    email: "user@example.com",
    name: "User",
    org_name: "",
    exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides
  };

  return [
    base64UrlEncode(JSON.stringify({ alg: "none", typ: "JWT" })),
    base64UrlEncode(JSON.stringify(claims)),
    "signature"
  ].join(".");
}

function base64UrlEncode(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
