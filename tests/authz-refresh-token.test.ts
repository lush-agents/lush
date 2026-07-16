import { describe, expect, test } from "bun:test";
import {
  createRefreshToken,
  refreshTokenFamilySecret,
  rotateRefreshToken
} from "../services/authz/src/refresh-token";

describe("refresh token families", () => {
  test("rotation preserves the family secret and replaces the token", () => {
    const initial = createRefreshToken();
    const rotated = rotateRefreshToken(initial);

    expect(rotated).not.toBe(initial);
    expect(refreshTokenFamilySecret(rotated)).toBe(
      refreshTokenFamilySecret(initial)
    );
  });

  test("legacy opaque tokens become the family secret on first rotation", () => {
    const legacyToken = "legacy-refresh-token";
    const rotated = rotateRefreshToken(legacyToken);

    expect(refreshTokenFamilySecret(rotated)).toBe(legacyToken);
    expect(rotated).not.toBe(legacyToken);
  });

  test("new sessions use independent token families", () => {
    const first = createRefreshToken();
    const second = createRefreshToken();

    expect(refreshTokenFamilySecret(first)).not.toBe(
      refreshTokenFamilySecret(second)
    );
  });
});
