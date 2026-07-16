export type GeneratedJwtKeyPair = {
  keyId: string;
  privateKeyPem: string;
  publicKeyPem: string;
};

export class JwtKeyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JwtKeyConfigError";
  }
}

export class JwtTokenError extends Error {
  constructor() {
    super("Invalid access token");
    this.name = "JwtTokenError";
  }
}

const rsaAlgorithm = {
  name: "RSASSA-PKCS1-v1_5",
  hash: "SHA-256"
} as const;

const keyIdPattern = /^[A-Za-z0-9._-]{1,128}$/;
export const jwtRsaModulusLengths = [2048, 3072, 4096] as const;
export type JwtRsaModulusLength = (typeof jwtRsaModulusLengths)[number];

export class JwtKeyStore {
  readonly publicKeys: ReadonlyMap<string, string>;
  private privateKeyPromise: Promise<CryptoKey> | undefined;
  private readonly publicKeyPromises = new Map<string, Promise<CryptoKey>>();

  constructor(
    readonly signingKeyId: string,
    private readonly privateKeyPem: string,
    publicKeys: Readonly<Record<string, string>>,
    private readonly allowMissingKeyId = false
  ) {
    validateKeyId(signingKeyId);
    this.publicKeys = new Map(Object.entries(publicKeys));
    if (!this.publicKeys.has(signingKeyId)) {
      throw new JwtKeyConfigError(
        `LUSH_AUTH_JWT_PUBLIC_KEYS does not contain signing key ${signingKeyId}`
      );
    }
  }

  async initialize() {
    const keyIds = [...this.publicKeys.keys()];
    const [privateKey, ...publicKeys] = await Promise.all([
      this.privateKey(),
      ...keyIds.map((keyId) => this.publicKey(keyId))
    ]);
    const signingPublicKey = publicKeys[keyIds.indexOf(this.signingKeyId)];
    const challenge = new TextEncoder().encode("lush-jwt-signing-key-check");
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      privateKey,
      challenge
    );
    const matches = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      signingPublicKey!,
      signature,
      challenge
    );
    if (!matches) {
      throw new JwtKeyConfigError(
        `JWT private key does not match signing key ${this.signingKeyId}`
      );
    }
  }

  async sign(payload: Record<string, unknown>) {
    const encodedHeader = base64UrlEncode(
      new TextEncoder().encode(
        JSON.stringify({
          alg: "RS256",
          typ: "JWT",
          kid: this.signingKeyId
        })
      )
    );
    const encodedPayload = base64UrlEncode(
      new TextEncoder().encode(JSON.stringify(payload))
    );
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      await this.privateKey(),
      new TextEncoder().encode(signingInput)
    );

    return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
  }

  async verify(token: string) {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new JwtTokenError();
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts as [
      string,
      string,
      string
    ];
    const header = parseJsonSegment(encodedHeader);
    if (header.alg !== "RS256" || header.typ !== "JWT") {
      throw new JwtTokenError();
    }

    const keyId =
      typeof header.kid === "string"
        ? header.kid
        : this.allowMissingKeyId
          ? this.signingKeyId
          : undefined;
    if (!keyId || !this.publicKeys.has(keyId)) {
      throw new JwtTokenError();
    }

    let signature: Uint8Array;
    try {
      signature = base64UrlDecode(encodedSignature);
    } catch {
      throw new JwtTokenError();
    }

    let verified: boolean;
    try {
      verified = await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        await this.publicKey(keyId),
        bytesToArrayBuffer(signature),
        new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
      );
    } catch (error) {
      if (error instanceof JwtKeyConfigError) {
        throw error;
      }
      throw new JwtTokenError();
    }

    if (!verified) {
      throw new JwtTokenError();
    }

    return parseJsonSegment(encodedPayload);
  }

  private privateKey() {
    this.privateKeyPromise ??= importJwtKey(
      "pkcs8",
      this.privateKeyPem,
      "PRIVATE KEY",
      ["sign"]
    );
    return this.privateKeyPromise;
  }

  private publicKey(keyId: string) {
    let key = this.publicKeyPromises.get(keyId);
    if (!key) {
      key = importJwtKey(
        "spki",
        this.publicKeys.get(keyId)!,
        "PUBLIC KEY",
        ["verify"]
      );
      this.publicKeyPromises.set(keyId, key);
    }
    return key;
  }
}

export function parseJwtPublicKeys(value: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new JwtKeyConfigError(
      "LUSH_AUTH_JWT_PUBLIC_KEYS must be a JSON object mapping key IDs to PEM public keys"
    );
  }

  if (!isRecord(parsed) || Object.keys(parsed).length === 0) {
    throw new JwtKeyConfigError(
      "LUSH_AUTH_JWT_PUBLIC_KEYS must contain at least one public key"
    );
  }

  const publicKeys: Record<string, string> = {};
  for (const [keyId, publicKey] of Object.entries(parsed)) {
    validateKeyId(keyId);
    if (typeof publicKey !== "string" || !publicKey.trim()) {
      throw new JwtKeyConfigError(
        `LUSH_AUTH_JWT_PUBLIC_KEYS entry ${keyId} must be a PEM public key`
      );
    }
    publicKeys[keyId] = normalizePem(publicKey);
  }

  return publicKeys;
}

export async function jwtKeyIdForPublicKey(publicKeyPem: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    pemToDer(publicKeyPem, "PUBLIC KEY")
  );
  return base64UrlEncode(new Uint8Array(digest));
}

export async function generateJwtKeyPair(
  keyId: string = crypto.randomUUID(),
  modulusLength: JwtRsaModulusLength = 3072
): Promise<GeneratedJwtKeyPair> {
  validateKeyId(keyId);
  const keyPair = await crypto.subtle.generateKey(
    {
      ...rsaAlgorithm,
      modulusLength,
      publicExponent: new Uint8Array([1, 0, 1])
    },
    true,
    ["sign", "verify"]
  );
  const [privateKey, publicKey] = await Promise.all([
    crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
    crypto.subtle.exportKey("spki", keyPair.publicKey)
  ]);

  return {
    keyId,
    privateKeyPem: pem("PRIVATE KEY", privateKey),
    publicKeyPem: pem("PUBLIC KEY", publicKey)
  };
}

export function parseJwtRsaModulusLength(value: string) {
  const modulusLength = jwtRsaModulusLengths.find(
    (candidate) => String(candidate) === value
  );
  if (!modulusLength) {
    throw new JwtKeyConfigError(
      `JWT RSA bits must be one of ${jwtRsaModulusLengths.join(", ")}`
    );
  }
  return modulusLength;
}

export function formatJwtKeyEnv(keyPair: GeneratedJwtKeyPair) {
  return [
    `LUSH_AUTH_JWT_KEY_ID=${keyPair.keyId}`,
    `LUSH_AUTH_JWT_PRIVATE_KEY=${quoteEnvValue(keyPair.privateKeyPem)}`,
    `LUSH_AUTH_JWT_PUBLIC_KEYS=${quoteEnvJsonValue(
      JSON.stringify({ [keyPair.keyId]: keyPair.publicKeyPem })
    )}`
  ].join("\n");
}

export function quoteEnvValue(value: string) {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"')}"`;
}

export function quoteEnvJsonValue(value: string) {
  if (value.includes("'")) {
    throw new JwtKeyConfigError(
      "JWT public key JSON cannot contain a single quote"
    );
  }
  return `'${value}'`;
}

function validateKeyId(keyId: string) {
  if (!keyIdPattern.test(keyId)) {
    throw new JwtKeyConfigError(
      "JWT key IDs must be 1-128 characters using letters, numbers, dot, underscore, or hyphen"
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function parseJsonSegment(value: string) {
  try {
    const parsed = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(value))
    );
    if (!isRecord(parsed)) {
      throw new JwtTokenError();
    }
    return parsed;
  } catch (error) {
    if (error instanceof JwtTokenError) {
      throw error;
    }
    throw new JwtTokenError();
  }
}

async function importJwtKey(
  format: "pkcs8" | "spki",
  value: string,
  label: "PRIVATE KEY" | "PUBLIC KEY",
  usages: KeyUsage[]
) {
  try {
    return await crypto.subtle.importKey(
      format,
      pemToDer(value, label),
      rsaAlgorithm,
      false,
      usages
    );
  } catch (error) {
    if (error instanceof JwtKeyConfigError) {
      throw error;
    }
    throw new JwtKeyConfigError(`Invalid JWT ${label.toLowerCase()}`);
  }
}

function pemToDer(value: string, label: "PRIVATE KEY" | "PUBLIC KEY") {
  const normalized = normalizePem(value).trim();
  const prefix = `-----BEGIN ${label}-----`;
  const suffix = `-----END ${label}-----`;
  if (!normalized.startsWith(prefix) || !normalized.endsWith(suffix)) {
    throw new JwtKeyConfigError(`Invalid JWT ${label.toLowerCase()}`);
  }

  const base64 = normalized
    .slice(prefix.length, -suffix.length)
    .replace(/\s+/g, "");
  try {
    return bytesToArrayBuffer(base64Decode(base64));
  } catch {
    throw new JwtKeyConfigError(`Invalid JWT ${label.toLowerCase()}`);
  }
}

function normalizePem(value: string) {
  return value.replace(/\\n/g, "\n");
}

function pem(label: string, keyData: ArrayBuffer) {
  const base64 = base64Encode(new Uint8Array(keyData));
  const lines = base64.match(/.{1,64}/g) ?? [];
  return [
    `-----BEGIN ${label}-----`,
    ...lines,
    `-----END ${label}-----`
  ].join("\n");
}

function base64UrlEncode(bytes: Uint8Array) {
  return base64Encode(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) {
    throw new Error("Invalid base64url");
  }
  return base64Decode(
    value.replace(/-/g, "+").replace(/_/g, "/")
  );
}

function base64Encode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64Decode(value: string) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}
