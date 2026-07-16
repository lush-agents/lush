export async function createRefreshToken(
  signingSecret: string,
  familySecret = randomSecret(),
  generation = 0
) {
  const payload = `${familySecret}.${generation}`;
  return `${payload}.${await hmacHex(payload, signingSecret)}`;
}

export function rotateRefreshToken(refreshToken: string, signingSecret: string) {
  return createRefreshToken(
    signingSecret,
    refreshTokenFamilySecret(refreshToken),
    refreshTokenGeneration(refreshToken) + 1
  );
}

export function refreshTokenFamilySecret(refreshToken: string) {
  const separator = refreshToken.indexOf(".");
  return separator === -1 ? refreshToken : refreshToken.slice(0, separator);
}

export function refreshTokenGeneration(refreshToken: string) {
  const parts = refreshToken.split(".");
  if (parts.length !== 3 || !/^\d+$/.test(parts[1] ?? "")) {
    return 0;
  }

  const generation = Number(parts[1]);
  return Number.isSafeInteger(generation) ? generation : 0;
}

function randomSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(value: string, signingSecret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
