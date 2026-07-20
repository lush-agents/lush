import {
  isLoopbackAddress,
  isTrustedProxyAddress,
  type TrustedProxySet
} from "./client-ip";

export const secureSessionCookieName = "__Host-lush_session";
export const plaintextSessionCookieName = "lush_session";
export const strictTransportSecurity = "max-age=31536000; includeSubDomains";
export const trustedProxySecretHeader = "x-lush-proxy-secret";

export type ProxyTrust = {
  forwardedHeadersTrusted: boolean;
  requestAllowed: boolean;
};

export function sessionCookieName(requireHttps: boolean) {
  return requireHttps ? secureSessionCookieName : plaintextSessionCookieName;
}

export function legacySessionCookieName(requireHttps: boolean) {
  return requireHttps ? plaintextSessionCookieName : secureSessionCookieName;
}

export function readSessionCookie(request: Request, requireHttps: boolean) {
  return cookieValue(request, sessionCookieName(requireHttps))
    ?? cookieValue(request, legacySessionCookieName(requireHttps));
}

export function hasLegacySessionCookie(request: Request, requireHttps: boolean) {
  return cookieValue(request, legacySessionCookieName(requireHttps)) !== undefined;
}

export function serializeSessionCookie(options: {
  name: string;
  value: string;
  attributes?: readonly string[];
  secure: boolean;
}) {
  return [
    `${options.name}=${encodeURIComponent(options.value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    ...(options.attributes ?? []),
    ...(options.secure ? ["Secure"] : [])
  ].join("; ");
}

export function expiredSessionCookie(
  name: string,
  secure = name.startsWith("__Host-")
) {
  return serializeSessionCookie({
    name,
    value: "",
    attributes: [
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      "Max-Age=0"
    ],
    secure
  });
}

export function isSecureRequest(options: {
  request: Request;
  remoteAddress?: string | null;
  trustedProxies: TrustedProxySet;
  forwardedHeadersTrusted?: boolean;
}) {
  const url = new URL(options.request.url);
  if (url.protocol === "https:") {
    return true;
  }
  if (
    isLoopbackHostname(url.hostname)
    && isLoopbackAddress(options.remoteAddress)
  ) {
    return true;
  }

  const forwardedHeadersTrusted = options.forwardedHeadersTrusted ??
    isTrustedProxyAddress(options.remoteAddress, options.trustedProxies);
  if (!forwardedHeadersTrusted) {
    return false;
  }

  const forwardedProto = options.request.headers.get("x-forwarded-proto");
  return forwardedProto?.split(",")[0]?.trim().toLowerCase() === "https";
}

export async function evaluateProxyTrust(options: {
  request: Request;
  remoteAddress?: string | null;
  trustedProxies: TrustedProxySet;
  trustedProxySecret?: string;
}): Promise<ProxyTrust> {
  const addressTrusted = isTrustedProxyAddress(
    options.remoteAddress,
    options.trustedProxies
  );
  const secretConfigured = Boolean(options.trustedProxySecret);
  const secretTrusted = secretConfigured && await proxySecretMatches(
    options.request.headers.get(trustedProxySecretHeader),
    options.trustedProxySecret!
  );
  const forwardedHeadersTrusted = addressTrusted || secretTrusted;
  const url = new URL(options.request.url);
  const directLoopback = isLoopbackHostname(url.hostname) &&
    isLoopbackAddress(options.remoteAddress);

  return {
    forwardedHeadersTrusted,
    requestAllowed: !secretConfigured || forwardedHeadersTrusted || directLoopback
  };
}

export function requestCarriesCredentials(request: Request) {
  return request.headers.has("authorization") || request.headers.has("cookie");
}

export function isSafeRedirectMethod(method: string) {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

export function httpsRedirectUrl(request: Request) {
  const url = new URL(request.url);
  url.protocol = "https:";
  return url.toString();
}

function cookieValue(request: Request, expectedName: string) {
  const cookies = request.headers.get("cookie");
  if (!cookies) {
    return undefined;
  }

  for (const cookie of cookies.split(";")) {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (name !== expectedName) {
      continue;
    }

    const value = valueParts.join("=");
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return undefined;
}

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized.startsWith("127.")
    || normalized === "::1"
    || normalized === "[::1]";
}

async function proxySecretMatches(actual: string | null, expected: string) {
  const encoder = new TextEncoder();
  const [actualDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual ?? "")),
    crypto.subtle.digest("SHA-256", encoder.encode(expected))
  ]);
  const actualBytes = new Uint8Array(actualDigest);
  const expectedBytes = new Uint8Array(expectedDigest);
  let different = actual === null ? 1 : 0;

  for (let index = 0; index < actualBytes.length; index += 1) {
    different |= actualBytes[index]! ^ expectedBytes[index]!;
  }

  return different === 0;
}
