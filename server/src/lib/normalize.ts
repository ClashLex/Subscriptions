/** Canonical email normalization: trim + lowercase, matching the docs. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
