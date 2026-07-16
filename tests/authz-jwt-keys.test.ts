import { beforeAll, describe, expect, test } from "bun:test";
import { parse as parseDotenv } from "dotenv";
import {
  formatJwtKeyEnv,
  generateJwtKeyPair,
  JwtKeyConfigError,
  JwtKeyStore,
  JwtTokenError,
  parseJwtPublicKeys,
  type GeneratedJwtKeyPair
} from "../services/authz/src/jwt-keys";

let oldKey: GeneratedJwtKeyPair;
let currentKey: GeneratedJwtKeyPair;

beforeAll(async () => {
  [oldKey, currentKey] = await Promise.all([
    generateJwtKeyPair("old-key"),
    generateJwtKeyPair("current-key")
  ]);
});

describe("JWT signing key rotation", () => {
  test("signs with RS256 and the current key ID", async () => {
    const store = keyStore(currentKey, [currentKey]);
    const token = await store.sign({ sub: "user-1" });
    const header = decodeSegment(token.split(".")[0]!);

    expect(header).toEqual({
      alg: "RS256",
      typ: "JWT",
      kid: "current-key"
    });
    expect(await store.verify(token)).toEqual({ sub: "user-1" });
  });

  test("verifies tokens from both the current and previous key", async () => {
    const oldToken = await keyStore(oldKey, [oldKey]).sign({ jti: "old" });
    const currentToken = await keyStore(currentKey, [currentKey]).sign({
      jti: "current"
    });
    const rotatedStore = keyStore(currentKey, [currentKey, oldKey]);

    expect(await rotatedStore.verify(oldToken)).toEqual({ jti: "old" });
    expect(await rotatedStore.verify(currentToken)).toEqual({ jti: "current" });
  });

  test("accepts a pre-key-ID token against the selected migration key", async () => {
    const token = await signWithoutKeyId(currentKey, { jti: "legacy" });
    const migrationStore = new JwtKeyStore(
      currentKey.keyId,
      currentKey.privateKeyPem,
      {
        [currentKey.keyId]: currentKey.publicKeyPem,
        [oldKey.keyId]: oldKey.publicKeyPem
      },
      true
    );

    expect(await migrationStore.verify(token)).toEqual({ jti: "legacy" });
  });

  test("rejects unknown key IDs and non-RS256 algorithms", async () => {
    const store = keyStore(currentKey, [currentKey]);
    const token = await store.sign({ sub: "user-1" });
    const [, payload, signature] = token.split(".");

    await expect(
      store.verify(
        `${encodeSegment({ alg: "RS256", typ: "JWT", kid: "unknown" })}.${payload}.${signature}`
      )
    ).rejects.toBeInstanceOf(JwtTokenError);
    await expect(
      store.verify(
        `${encodeSegment({ alg: "HS256", typ: "JWT", kid: "current-key" })}.${payload}.${signature}`
      )
    ).rejects.toBeInstanceOf(JwtTokenError);
  });

  test("requires the signing key to be present in the verification set", () => {
    expect(
      () => new JwtKeyStore("missing", currentKey.privateKeyPem, {
        [currentKey.keyId]: currentKey.publicKeyPem
      })
    ).toThrow(JwtKeyConfigError);
  });
});

test("key generation formats a complete, parseable dotenv configuration", async () => {
  const output = formatJwtKeyEnv(currentKey);

  expect(output).toContain("LUSH_AUTH_JWT_KEY_ID=current-key");
  expect(output).toContain("LUSH_AUTH_JWT_PRIVATE_KEY=");
  const publicKeysLine = output
    .split("\n")
    .find((line) => line.startsWith("LUSH_AUTH_JWT_PUBLIC_KEYS="));
  expect(publicKeysLine).toBeDefined();
  expect(output).toContain('\'{"current-key":"-----BEGIN PUBLIC KEY-----');

  const env = parseDotenv(output);
  const publicKeys = parseJwtPublicKeys(env.LUSH_AUTH_JWT_PUBLIC_KEYS!);
  const store = new JwtKeyStore(
    env.LUSH_AUTH_JWT_KEY_ID!,
    env.LUSH_AUTH_JWT_PRIVATE_KEY!,
    publicKeys
  );
  const token = await store.sign({ sub: "generated-config" });
  expect(await store.verify(token)).toEqual({ sub: "generated-config" });
});

test("public key sets reject malformed or empty maps", () => {
  expect(() => parseJwtPublicKeys("[]")).toThrow(JwtKeyConfigError);
  expect(() => parseJwtPublicKeys("{}")).toThrow(JwtKeyConfigError);
  expect(() => parseJwtPublicKeys('{"bad key":"pem"}')).toThrow(
    JwtKeyConfigError
  );
});

function keyStore(
  signer: GeneratedJwtKeyPair,
  verificationKeys: GeneratedJwtKeyPair[]
) {
  return new JwtKeyStore(
    signer.keyId,
    signer.privateKeyPem,
    Object.fromEntries(
      verificationKeys.map((key) => [key.keyId, key.publicKeyPem])
    )
  );
}

function decodeSegment(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
}

function encodeSegment(value: Record<string, unknown>) {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function signWithoutKeyId(
  keyPair: GeneratedJwtKeyPair,
  payload: Record<string, unknown>
) {
  const encodedHeader = encodeSegment({ alg: "RS256", typ: "JWT" });
  const encodedPayload = encodeSegment(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    decodePem(keyPair.privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput)
  );
  const encodedSignature = btoa(
    String.fromCharCode(...new Uint8Array(signature))
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${signingInput}.${encodedSignature}`;
}

function decodePem(value: string) {
  const base64 = value
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bytes = Uint8Array.from(atob(base64), (character) =>
    character.charCodeAt(0)
  );
  return bytes.buffer;
}
