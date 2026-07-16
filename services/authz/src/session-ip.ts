import {
  envSchema,
  readEnvSchema,
  requiredEnvValue,
  type EnvSource,
  z
} from "@lush/config/env";

export const sessionIpModes = ["off", "hmac", "plain"] as const;
export type SessionIpMode = (typeof sessionIpModes)[number];

export function readSessionIpMode(env?: EnvSource): SessionIpMode {
  return readEnvSchema(
    {
      LUSH_SESSION_IP_MODE: envSchema
        .optionalString("hmac")
        .pipe(z.enum(sessionIpModes))
    },
    env
  ).LUSH_SESSION_IP_MODE;
}

export const sessionIpMode = readSessionIpMode();

export async function retainedSessionIp(
  ipAddress: string | null | undefined,
  options: {
    mode?: SessionIpMode;
    hmacKey?: string;
  } = {}
) {
  if (!ipAddress) {
    return { value: null, mode: null } as const;
  }

  const mode = options.mode ?? sessionIpMode;
  if (mode === "off") {
    return { value: null, mode } as const;
  }
  if (mode === "plain") {
    return { value: ipAddress, mode } as const;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(
      options.hmacKey ?? requiredEnvValue("LUSH_SECRET_KEY")
    ),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`lush:session-ip:v1\0${ipAddress}`)
  );

  return {
    value: bytesToHex(new Uint8Array(signature)),
    mode
  } as const;
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
