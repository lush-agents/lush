import { describe, expect, test } from "bun:test";
import {
  isLoopbackAddress,
  parseTrustedProxies,
  rateLimitNetworkKey,
  resolveClientIp
} from "../services/api/src/client-ip";

describe("API client IP resolution", () => {
  test("ignores forwarded headers from an untrusted direct peer", () => {
    expect(resolveClientIp({
      remoteAddress: "198.51.100.7",
      forwardedFor: "203.0.113.10",
      realIp: null,
      trustedProxies: parseTrustedProxies([])
    })).toBe("198.51.100.7");
  });

  test("walks a trusted proxy chain from right to left", () => {
    expect(resolveClientIp({
      remoteAddress: "10.0.0.3",
      forwardedFor: "203.0.113.10, 10.0.0.2",
      realIp: null,
      trustedProxies: parseTrustedProxies(["10.0.0.0/8"])
    })).toBe("203.0.113.10");
  });

  test("stops at the first untrusted hop", () => {
    expect(resolveClientIp({
      remoteAddress: "10.0.0.3",
      forwardedFor: "192.0.2.4, 198.51.100.9",
      realIp: null,
      trustedProxies: parseTrustedProxies(["10.0.0.0/8"])
    })).toBe("198.51.100.9");
  });

  test("supports IPv6 CIDR ranges and canonicalizes addresses", () => {
    expect(resolveClientIp({
      remoteAddress: "2001:db8:abcd::2",
      forwardedFor: "2001:db8:ffff::5",
      realIp: null,
      trustedProxies: parseTrustedProxies(["2001:db8:abcd::/48"])
    })).toBe("2001:db8:ffff:0:0:0:0:5");
  });

  test("treats IPv4-mapped peer addresses as IPv4", () => {
    expect(resolveClientIp({
      remoteAddress: "::ffff:10.0.0.3",
      forwardedFor: null,
      realIp: "203.0.113.10",
      trustedProxies: parseTrustedProxies(["10.0.0.0/8"])
    })).toBe("203.0.113.10");
  });

  test("falls back to the direct peer for a malformed forwarding chain", () => {
    expect(resolveClientIp({
      remoteAddress: "10.0.0.3",
      forwardedFor: "not-an-ip, 10.0.0.2",
      realIp: null,
      trustedProxies: parseTrustedProxies(["10.0.0.0/8"])
    })).toBe("10.0.0.3");
  });

  test("rejects invalid trusted proxy entries", () => {
    expect(() => parseTrustedProxies(["10.0.0.0/99"])).toThrow();
    expect(() => parseTrustedProxies(["proxy.internal"])).toThrow();
  });

  test("recognizes only IP loopback ranges", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("127.20.30.40")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("10.0.0.1")).toBe(false);
    expect(isLoopbackAddress("::2")).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
  });

  test("groups IPv6 rate-limit keys by /64 without grouping IPv4 addresses", () => {
    expect(rateLimitNetworkKey("2001:db8:abcd:1234::1"))
      .toBe(rateLimitNetworkKey("2001:db8:abcd:1234:ffff::2"));
    expect(rateLimitNetworkKey("2001:db8:abcd:1234::1"))
      .not.toBe(rateLimitNetworkKey("2001:db8:abcd:1235::1"));
    expect(rateLimitNetworkKey("203.0.113.10"))
      .not.toBe(rateLimitNetworkKey("203.0.113.11"));
  });
});
