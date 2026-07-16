export function normalizeAuthEmail(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}
