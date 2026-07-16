import {
  isLoopbackAddress,
  isTrustedProxyAddress,
  type TrustedProxySet
} from "./client-ip";

export const secureSessionCookieName = "__Host-lush_session";
export const plaintextSessionCookieName = "lush_session";
export const strictTransportSecurity = "max-age=31536000; includeSubDomains";

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

  if (!isTrustedProxyAddress(options.remoteAddress, options.trustedProxies)) {
    return false;
  }

  const forwardedProto = options.request.headers.get("x-forwarded-proto");
  return forwardedProto?.split(",")[0]?.trim().toLowerCase() === "https";
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
