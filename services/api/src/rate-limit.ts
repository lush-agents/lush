export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

export class SlidingWindowRateLimiter {
  private readonly attempts = new Map<string, number[]>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private readonly maximumKeys = 50_000
  ) {
    if (limit < 1 || windowMs < 1 || maximumKeys < 1) {
      throw new Error("Rate limiter values must be positive");
    }
  }

  consume(key: string, now = Date.now()): RateLimitResult {
    const cutoff = now - this.windowMs;
    const existingAttempts = this.attempts.get(key);
    const attempts = (existingAttempts ?? [])
      .filter((timestamp) => timestamp > cutoff);

    if (attempts.length >= this.limit) {
      this.touch(key, attempts);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((attempts[0]! + this.windowMs - now) / 1_000)
        )
      };
    }

    attempts.push(now);
    if (!existingAttempts) {
      this.ensureCapacity(now);
    }
    this.touch(key, attempts);
    return { allowed: true, remaining: this.limit - attempts.length };
  }

  clear(key: string) {
    this.attempts.delete(key);
  }

  private touch(key: string, attempts: number[]) {
    this.attempts.delete(key);
    this.attempts.set(key, attempts);
  }

  private ensureCapacity(now: number) {
    if (this.attempts.size < this.maximumKeys) {
      return;
    }

    for (const [key, attempts] of this.attempts) {
      if (attempts[attempts.length - 1]! <= now - this.windowMs) {
        this.attempts.delete(key);
      }
    }

    if (this.attempts.size >= this.maximumKeys) {
      const oldestKey = this.attempts.keys().next().value;
      if (oldestKey !== undefined) {
        this.attempts.delete(oldestKey);
      }
    }
  }
}

export const authRateLimitPolicies = {
  registerIp: { limit: 5, windowMs: 60 * 60_000 },
  registerEmail: { limit: 3, windowMs: 60 * 60_000 },
  loginIp: { limit: 300, windowMs: 15 * 60_000 },
  loginEmailIp: { limit: 5, windowMs: 15 * 60_000 },
  loginEmail: { limit: 40, windowMs: 15 * 60_000 },
  refreshIp: { limit: 2_000, windowMs: 5 * 60_000 },
  refreshSession: { limit: 20, windowMs: 5 * 60_000 },
  passwordResetIp: { limit: 60, windowMs: 60 * 60_000 },
  passwordResetEmail: { limit: 3, windowMs: 60 * 60_000 }
} as const;

export function compoundRateLimitKey(...parts: string[]) {
  return JSON.stringify(parts);
}

export async function hashRateLimitKey(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
