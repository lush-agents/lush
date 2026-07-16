import { describe, expect, test } from "bun:test";
import { validateReleaseRef } from "../scripts/validate-release";

describe("release version validation", () => {
  test("accepts exact stable and prerelease tags", () => {
    expect(validateReleaseRef("v0.1.0", "0.1.0")).toBe("0.1.0");
    expect(validateReleaseRef("refs/tags/v1.2.3-rc.1", "1.2.3-rc.1")).toBe(
      "1.2.3-rc.1"
    );
  });

  test("rejects invalid or mismatched release coordinates", () => {
    expect(() => validateReleaseRef("v1.2.3-01", "1.2.3-01")).toThrow(
      "SemVer tag"
    );
    expect(() => validateReleaseRef("v1.2.3+build.1", "1.2.3+build.1")).toThrow(
      "SemVer tag"
    );
    expect(() => validateReleaseRef("v1.2.3", "1.2.4")).toThrow(
      "does not match"
    );
  });
});
