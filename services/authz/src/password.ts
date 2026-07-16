const argon2idOptions = {
  algorithm: "argon2id",
  memoryCost: 64 * 1024,
  timeCost: 2
} as const;

const bunPassword = (
  globalThis as typeof globalThis & {
    Bun: {
      password: {
        hash(
          password: string,
          options: typeof argon2idOptions
        ): Promise<string>;
        verify(
          password: string,
          passwordHash: string,
          algorithm: "argon2id"
        ): Promise<boolean>;
      };
    };
  }
).Bun.password;

export const passwordMaxLength = 512;

export async function hashPassword(password: string) {
  return bunPassword.hash(password, argon2idOptions);
}

export async function verifyPassword(password: string, passwordHash: string) {
  if (passwordHash.startsWith("$argon2id$")) {
    try {
      return await bunPassword.verify(password, passwordHash, "argon2id");
    } catch {
      return false;
    }
  }

  return verifyLegacyPbkdf2Password(password, passwordHash);
}

export function passwordHashNeedsUpgrade(passwordHash: string) {
  return passwordHash.startsWith("pbkdf2-sha256$");
}

// A static, valid hash makes unknown-email logins pay the same Argon2id cost as
// wrong-password logins without generating a new salt for every request.
export const dummyPasswordHash =
  "$argon2id$v=19$m=65536,t=2,p=1$ZN+8UZ6zer07QEZFtD3XsVE+0pciuFgz2bvsUt2f2zo$1Cpu63HqIudXBYLEzRsZqWDXhVmXo7GhXDa+xOgaNTc";

async function verifyLegacyPbkdf2Password(
  password: string,
  passwordHash: string
) {
  const [algorithm, iterationsValue, saltValue, hashValue] = passwordHash.split("$");
  if (
    algorithm !== "pbkdf2-sha256" ||
    !iterationsValue ||
    !isHex(saltValue) ||
    !isHex(hashValue)
  ) {
    return false;
  }

  const iterations = Number(iterationsValue);
  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }

  const expected = hexToBytes(hashValue);
  const actual = await derivePbkdf2Password(
    password,
    hexToBytes(saltValue),
    iterations
  );
  return timingSafeEqual(actual, expected);
}

async function derivePbkdf2Password(
  password: string,
  salt: Uint8Array,
  iterations: number
) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: bytesToArrayBuffer(salt),
      iterations
    },
    material,
    256
  );

  return new Uint8Array(bits);
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left[index] ^ right[index];
  }

  return result === 0;
}

function isHex(value: string | undefined): value is string {
  return Boolean(value && value.length % 2 === 0 && /^[a-f0-9]+$/i.test(value));
}

function hexToBytes(value: string) {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}
