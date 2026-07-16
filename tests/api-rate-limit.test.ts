import { describe, expect, test } from "bun:test";
import {
  normalizeRateLimitEmail,
  SlidingWindowRateLimiter
} from "../services/api/src/rate-limit";

describe("API sliding-window rate limiter", () => {
  test("rejects attempts over the limit and reports when to retry", () => {
    const limiter = new SlidingWindowRateLimiter(2, 1_000);

    expect(limiter.consume("key", 1_000)).toEqual({ allowed: true, remaining: 1 });
    expect(limiter.consume("key", 1_100)).toEqual({ allowed: true, remaining: 0 });
    expect(limiter.consume("key", 1_200)).toEqual({
      allowed: false,
      retryAfterSeconds: 1
    });
    expect(limiter.consume("key", 2_101)).toEqual({ allowed: true, remaining: 1 });
  });

  test("isolates keys and can clear successful-login state", () => {
    const limiter = new SlidingWindowRateLimiter(1, 1_000);

    expect(limiter.consume("first", 1_000).allowed).toBe(true);
    expect(limiter.consume("second", 1_000).allowed).toBe(true);
    expect(limiter.consume("first", 1_001).allowed).toBe(false);
    limiter.clear("first");
    expect(limiter.consume("first", 1_002).allowed).toBe(true);
  });

  test("normalizes email keys independently of source IP", () => {
    expect(normalizeRateLimitEmail({ email: " User@Example.com " }))
      .toBe("user@example.com");
    expect(normalizeRateLimitEmail({ email: "not-an-email" })).toBe("invalid");
    expect(normalizeRateLimitEmail(undefined)).toBe("invalid");
  });
});
