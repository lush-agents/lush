import { describe, expect, test } from "bun:test";
import {
  readSessionIpMode,
  retainedSessionIp
} from "../services/authz/src/session-ip";

describe("session IP retention", () => {
  test("defaults to hmac and validates configured modes", () => {
    expect(readSessionIpMode({})).toBe("hmac");
    expect(readSessionIpMode({ LUSH_SESSION_IP_MODE: "off" })).toBe("off");
    expect(readSessionIpMode({ LUSH_SESSION_IP_MODE: "plain" })).toBe("plain");
    expect(() =>
      readSessionIpMode({ LUSH_SESSION_IP_MODE: "sha256" })
    ).toThrow("Invalid environment variables: LUSH_SESSION_IP_MODE");
  });

  test("off retains no address and plain retains the address explicitly", async () => {
    expect(
      await retainedSessionIp("203.0.113.10", { mode: "off" })
    ).toEqual({ value: null, mode: "off" });
    expect(
      await retainedSessionIp("203.0.113.10", { mode: "plain" })
    ).toEqual({ value: "203.0.113.10", mode: "plain" });
    expect(await retainedSessionIp(null, { mode: "hmac" })).toEqual({
      value: null,
      mode: null
    });
  });

  test("hmac is deterministic, keyed, and not the legacy SHA-256 digest", async () => {
    const ipAddress = "203.0.113.10";
    const first = await retainedSessionIp(ipAddress, {
      mode: "hmac",
      hmacKey: "first-key"
    });
    const repeated = await retainedSessionIp(ipAddress, {
      mode: "hmac",
      hmacKey: "first-key"
    });
    const otherKey = await retainedSessionIp(ipAddress, {
      mode: "hmac",
      hmacKey: "second-key"
    });
    const legacyDigest = bytesToHex(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(ipAddress)
        )
      )
    );

    expect(first.mode).toBe("hmac");
    expect(first.value).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toEqual(repeated);
    expect(first.value).not.toBe(otherKey.value);
    expect(first.value).not.toBe(legacyDigest);
  });
});

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
