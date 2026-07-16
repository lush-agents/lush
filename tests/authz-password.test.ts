import { expect, test } from "bun:test";
import {
  dummyPasswordHash,
  hashPassword,
  passwordHashNeedsUpgrade,
  passwordMaxLength,
  verifyPassword
} from "../services/authz/src/password";
import { registerAccount } from "../services/authz/src/runtime";

const legacyPasswordHash =
  "pbkdf2-sha256$210000$00000000000000000000000000000000$0874caac5987c61b6f423794064371a0532243af7fb62697cac9fc97e90c0341";

test("new password hashes use the configured Argon2id cost", async () => {
  const passwordHash = await hashPassword("new-password");

  expect(passwordHash).toStartWith("$argon2id$v=19$m=65536,t=2,p=1$");
  expect(passwordHashNeedsUpgrade(passwordHash)).toBe(false);
  await expect(verifyPassword("new-password", passwordHash)).resolves.toBe(true);
  await expect(verifyPassword("wrong-password", passwordHash)).resolves.toBe(false);
});

test("legacy PBKDF2 hashes remain verifiable for login migration", async () => {
  expect(passwordHashNeedsUpgrade(legacyPasswordHash)).toBe(true);
  await expect(verifyPassword("legacy-password", legacyPasswordHash)).resolves.toBe(
    true
  );
  await expect(verifyPassword("wrong-password", legacyPasswordHash)).resolves.toBe(
    false
  );
});

test("the unknown-account hash uses the configured Argon2id cost", async () => {
  expect(dummyPasswordHash).toStartWith("$argon2id$v=19$m=65536,t=2,p=1$");
  await expect(verifyPassword("wrong-password", dummyPasswordHash)).resolves.toBe(
    false
  );
});

test("registration rejects passwords longer than the public maximum", async () => {
  await expect(
    registerAccount({
      email: "long-password@example.com",
      password: "a".repeat(passwordMaxLength + 1)
    })
  ).rejects.toMatchObject({
    code: "invalid_password",
    message: `Password must be at most ${passwordMaxLength} characters`
  });
});
