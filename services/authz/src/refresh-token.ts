export function createRefreshToken(familySecret = randomSecret()) {
  return `${familySecret}.${randomSecret()}`;
}

export function rotateRefreshToken(refreshToken: string) {
  return createRefreshToken(refreshTokenFamilySecret(refreshToken));
}

export function refreshTokenFamilySecret(refreshToken: string) {
  const separator = refreshToken.indexOf(".");
  return separator === -1 ? refreshToken : refreshToken.slice(0, separator);
}

function randomSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
