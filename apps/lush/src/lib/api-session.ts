import {
  ApiError,
  type AccessSession,
  refreshSession,
  type UserRole
} from "@lush/api-client";

export type AccessTokenClaims = {
  sub: string;
  sid: string;
  org: string | null;
  mid: string | null;
  role: UserRole | null;
  email: string;
  name: string;
  org_name: string;
  exp: number;
};

export type NormalizedAccessSession = {
  accessSession: AccessSession;
  claims: AccessTokenClaims;
};

const accessSessionCacheKey = "lush:access-session";
const accessTokenExpirySkewMs = 60_000;

type BrowserSessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function normalizeAccessSession(
  accessSession: AccessSession
): NormalizedAccessSession {
  const claims = parseAccessTokenClaims(accessSession.accessToken);
  if (!claims) {
    throw new Error("Invalid access token");
  }

  return {
    accessSession: {
      ...accessSession,
      accessTokenExpiresAt: new Date(claims.exp * 1000).toISOString()
    },
    claims
  };
}

export function readCachedAccessSession(
  storage: BrowserSessionStorage = window.sessionStorage
) {
  try {
    const raw = storage.getItem(accessSessionCacheKey);
    if (!raw) {
      return undefined;
    }

    const candidate = JSON.parse(raw);
    if (!isAccessSession(candidate)) {
      clearCachedAccessSession(storage);
      return undefined;
    }

    return candidate as AccessSession;
  } catch {
    clearCachedAccessSession(storage);
    return undefined;
  }
}

export function writeCachedAccessSession(
  accessSession: AccessSession,
  storage: BrowserSessionStorage = window.sessionStorage
) {
  if (accessTokenExpiresSoon(accessSession.accessTokenExpiresAt)) {
    clearCachedAccessSession(storage);
    return;
  }

  try {
    storage.setItem(accessSessionCacheKey, JSON.stringify(accessSession));
  } catch {
    clearCachedAccessSession(storage);
  }
}

export function clearCachedAccessSession(
  storage: BrowserSessionStorage = window.sessionStorage
) {
  try {
    storage.removeItem(accessSessionCacheKey);
  } catch {
    // The refresh cookie remains the source of truth if storage is unavailable.
  }
}

export async function refreshAccessSession(
  apiBaseUrl: string,
  applySession: (accessSession: AccessSession) => void | Promise<void>
) {
  const accessSession = await refreshSession(apiBaseUrl, {});
  await applySession(accessSession);
  return accessSession;
}

export async function withTokenRefresh<T>(
  options: {
    apiBaseUrl: string;
    accessSession: AccessSession;
    applySession: (accessSession: AccessSession) => void | Promise<void>;
    refreshAccessSession?: () => Promise<AccessSession>;
  },
  operation: (accessSession: AccessSession) => Promise<T>
) {
  try {
    return await operation(options.accessSession);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }

    const refreshed = options.refreshAccessSession
      ? await options.refreshAccessSession()
      : await refreshAccessSession(options.apiBaseUrl, options.applySession);
    return operation(refreshed);
  }
}

export function parseAccessTokenClaims(
  token: string
): AccessTokenClaims | undefined {
  const [, encodedClaims] = token.split(".");
  if (!encodedClaims) {
    return undefined;
  }

  try {
    const claims = JSON.parse(base64UrlDecode(encodedClaims)) as Record<
      string,
      unknown
    >;
    if (!isAccessTokenClaims(claims)) {
      return undefined;
    }

    if (claims.exp * 1000 <= Date.now()) {
      return undefined;
    }

    return claims;
  } catch {
    return undefined;
  }
}

export function accessTokenExpiresSoon(expiresAtValue: string) {
  const expiresAt = Date.parse(expiresAtValue);
  return (
    !Number.isFinite(expiresAt) ||
    expiresAt - Date.now() <= accessTokenExpirySkewMs
  );
}

function isAccessSession(candidate: unknown): candidate is AccessSession {
  if (!candidate || typeof candidate !== "object") {
    return false;
  }

  const session = candidate as AccessSession;
  if (
    typeof session.accessToken !== "string" ||
    typeof session.accessTokenExpiresAt !== "string"
  ) {
    return false;
  }

  const claims = parseAccessTokenClaims(session.accessToken);
  return (
    Boolean(claims) &&
    !accessTokenExpiresSoon(session.accessTokenExpiresAt) &&
    Boolean(session.session) &&
    typeof session.session?.user?.displayName === "string" &&
    (session.session.organization === null ||
      typeof session.session.organization?.name === "string")
  );
}

function isAccessTokenClaims(
  claims: Record<string, unknown>
): claims is AccessTokenClaims {
  return (
    typeof claims.sub === "string" &&
    typeof claims.sid === "string" &&
    (typeof claims.org === "string" || claims.org === null) &&
    (typeof claims.mid === "string" || claims.mid === null) &&
    (claims.role === "admin" || claims.role === "user" || claims.role === null) &&
    typeof claims.email === "string" &&
    typeof claims.name === "string" &&
    typeof claims.org_name === "string" &&
    typeof claims.exp === "number"
  );
}

function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "="
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}
