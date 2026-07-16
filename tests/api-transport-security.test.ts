import { describe, expect, test } from "bun:test";
import { parseTrustedProxies } from "../services/api/src/client-ip";
import {
  expiredSessionCookie,
  hasLegacySessionCookie,
  httpsRedirectUrl,
  isSafeRedirectMethod,
  isSecureRequest,
  plaintextSessionCookieName,
  readSessionCookie,
  requestCarriesCredentials,
  secureSessionCookieName,
  serializeSessionCookie,
  sessionCookieName
} from "../services/api/src/transport-security";

describe("API transport security", () => {
  test("uses a host-only secure cookie when HTTPS is required", () => {
    expect(sessionCookieName(true)).toBe(secureSessionCookieName);
    expect(serializeSessionCookie({
      name: sessionCookieName(true),
      value: "token value",
      secure: true
    })).toBe(
      "__Host-lush_session=token%20value; Path=/; HttpOnly; SameSite=Lax; Secure"
    );
  });

  test("keeps the explicit plaintext opt-out LAN compatible", () => {
    expect(sessionCookieName(false)).toBe(plaintextSessionCookieName);
    expect(serializeSessionCookie({
      name: sessionCookieName(false),
      value: "token",
      secure: false
    })).toBe("lush_session=token; Path=/; HttpOnly; SameSite=Lax");
  });

  test("prefers the current cookie but accepts and identifies the legacy name", () => {
    const legacyRequest = new Request("https://api.example.com", {
      headers: { cookie: "lush_session=legacy%20token" }
    });
    expect(readSessionCookie(legacyRequest, true)).toBe("legacy token");
    expect(hasLegacySessionCookie(legacyRequest, true)).toBe(true);

    const bothRequest = new Request("https://api.example.com", {
      headers: {
        cookie: "lush_session=legacy; __Host-lush_session=current"
      }
    });
    expect(readSessionCookie(bothRequest, true)).toBe("current");
  });

  test("expires prefixed legacy cookies with the required attributes", () => {
    expect(expiredSessionCookie(secureSessionCookieName)).toContain(
      "__Host-lush_session=; Path=/; HttpOnly; SameSite=Lax"
    );
    expect(expiredSessionCookie(secureSessionCookieName)).toContain("Secure");
    expect(expiredSessionCookie(secureSessionCookieName)).toContain("Max-Age=0");
  });

  test("believes forwarded protocol only from a trusted direct peer", () => {
    const request = new Request("http://api.example.com", {
      headers: { "x-forwarded-proto": "https" }
    });
    expect(isSecureRequest({
      request,
      remoteAddress: "198.51.100.7",
      trustedProxies: parseTrustedProxies([])
    })).toBe(false);
    expect(isSecureRequest({
      request,
      remoteAddress: "10.0.0.4",
      trustedProxies: parseTrustedProxies(["10.0.0.0/8"])
    })).toBe(true);
  });

  test("allows HTTPS and requires both a loopback origin and socket peer for HTTP", () => {
    expect(isSecureRequest({
      request: new Request("https://api.example.com"),
      remoteAddress: "198.51.100.7",
      trustedProxies: parseTrustedProxies([])
    })).toBe(true);

    for (const url of [
      "http://localhost:7330",
      "http://127.0.0.1:7330",
      "http://[::1]:7330"
    ]) {
      expect(isSecureRequest({
        request: new Request(url),
        remoteAddress: "127.0.0.1",
        trustedProxies: parseTrustedProxies([])
      })).toBe(true);
    }

    expect(isSecureRequest({
      request: new Request("http://localhost:7330"),
      remoteAddress: "198.51.100.7",
      trustedProxies: parseTrustedProxies([])
    })).toBe(false);
    expect(isSecureRequest({
      request: new Request("http://api.example.com"),
      remoteAddress: "127.0.0.1",
      trustedProxies: parseTrustedProxies([])
    })).toBe(false);
  });

  test("distinguishes redirectable requests from credential-bearing requests", () => {
    expect(isSafeRedirectMethod("GET")).toBe(true);
    expect(isSafeRedirectMethod("POST")).toBe(false);
    expect(httpsRedirectUrl(new Request("http://api.example.com/path?q=1")))
      .toBe("https://api.example.com/path?q=1");
    expect(requestCarriesCredentials(new Request("http://api.example.com", {
      headers: { authorization: "Bearer token" }
    }))).toBe(true);
    expect(requestCarriesCredentials(new Request("http://api.example.com")))
      .toBe(false);
  });
});
