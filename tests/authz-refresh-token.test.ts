import { describe, expect, test } from "bun:test";
import {
  createRefreshToken,
  refreshTokenFamilySecret,
  rotateRefreshToken
} from "../services/authz/src/refresh-token";

describe("refresh token families", () => {
  const signingSecret = "test-refresh-signing-secret";

  test("rotation preserves the family secret and replaces the token", async () => {
    const initial = await createRefreshToken(signingSecret);
    const rotated = await rotateRefreshToken(initial, signingSecret);

    expect(rotated).not.toBe(initial);
    expect(refreshTokenFamilySecret(rotated)).toBe(
      refreshTokenFamilySecret(initial)
    );
  });

  test("legacy opaque tokens become the family secret on first rotation", async () => {
    const legacyToken = "legacy-refresh-token";
    const rotated = await rotateRefreshToken(legacyToken, signingSecret);

    expect(refreshTokenFamilySecret(rotated)).toBe(legacyToken);
    expect(rotated).not.toBe(legacyToken);
  });

  test("new sessions use independent token families", async () => {
    const first = await createRefreshToken(signingSecret);
    const second = await createRefreshToken(signingSecret);

    expect(refreshTokenFamilySecret(first)).not.toBe(
      refreshTokenFamilySecret(second)
    );
  });

  test("concurrent rotation of one generation returns one successor", async () => {
    const initial = await createRefreshToken(signingSecret);

    expect(await rotateRefreshToken(initial, signingSecret)).toBe(
      await rotateRefreshToken(initial, signingSecret)
    );
  });
});
