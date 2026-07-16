import { describe, expect, test } from "bun:test";
import {
  compoundRateLimitKey,
  hashRateLimitKey,
  SlidingWindowRateLimiter
} from "../services/api/src/rate-limit";
import { normalizeAuthEmail } from "../services/authz/src/email";

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

  test("builds unambiguous compound keys", () => {
    expect(compoundRateLimitKey("a:b", "c"))
      .not.toBe(compoundRateLimitKey("a", "b:c"));
  });

  test("uses the auth service's canonical email normalization", () => {
    expect(normalizeAuthEmail(" User@Example.com ")).toBe("user@example.com");
    expect(normalizeAuthEmail("not-an-email")).toBe("");
  });

  test("hashes sensitive rate-limit keys deterministically", async () => {
    expect(await hashRateLimitKey("family-secret"))
      .toBe(await hashRateLimitKey("family-secret"));
    expect(await hashRateLimitKey("family-secret"))
      .not.toBe(await hashRateLimitKey("other-family"));
  });
});
