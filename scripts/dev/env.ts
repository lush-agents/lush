import { constants, existsSync } from "node:fs";
import { access } from "node:fs/promises";

export const devEnvPath = ".env.development";
export const devEnvTemplatePath = ".env.template";

const privateKeyPlaceholder = "__GENERATED_LUSH_AUTH_JWT_PRIVATE_KEY__";
const publicKeyPlaceholder = "__GENERATED_LUSH_AUTH_JWT_PUBLIC_KEY__";
const secretKeyPlaceholder = "__GENERATED_LUSH_SECRET_KEY__";

export type DevEnvSecrets = {
  privateKeyPem: string;
  publicKeyPem: string;
  secretKey: string;
};

export async function ensureDevEnvFile(options: {
  envPath?: string;
  templatePath?: string;
} = {}) {
  const envPath = options.envPath ?? devEnvPath;
  const templatePath = options.templatePath ?? devEnvTemplatePath;

  if (await fileExists(envPath)) {
    return {
      created: false as const,
      path: envPath
    };
  }

  const template = await Bun.file(templatePath).text();
  const contents = fillDevEnvTemplate(template, await generateDevEnvSecrets());
  await Bun.write(envPath, contents);

  return {
    created: true as const,
    path: envPath
  };
}

export function fillDevEnvTemplate(template: string, secrets: DevEnvSecrets) {
  const missingPlaceholders = [
    privateKeyPlaceholder,
    publicKeyPlaceholder,
    secretKeyPlaceholder
  ].filter((placeholder) => !template.includes(placeholder));

  if (missingPlaceholders.length > 0) {
    throw new Error(
      `.env template is missing placeholders: ${missingPlaceholders.join(", ")}`
    );
  }

  return template
    .replace(privateKeyPlaceholder, quoteEnvValue(secrets.privateKeyPem))
    .replace(publicKeyPlaceholder, quoteEnvValue(secrets.publicKeyPem))
    .replace(secretKeyPlaceholder, quoteEnvValue(secrets.secretKey));
}

export async function generateDevEnvSecrets(): Promise<DevEnvSecrets> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["sign", "verify"]
  );

  const [privateKey, publicKey] = await Promise.all([
    crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
    crypto.subtle.exportKey("spki", keyPair.publicKey)
  ]);

  return {
    privateKeyPem: pem("PRIVATE KEY", privateKey),
    publicKeyPem: pem("PUBLIC KEY", publicKey),
    secretKey: randomHex(32)
  };
}

function quoteEnvValue(value: string) {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"')}"`;
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

function base64Encode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function randomHex(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function fileExists(path: string) {
  if (existsSync(path)) {
    return true;
  }

  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
