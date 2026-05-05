/**
 * Validates that a string is a well-formed http(s) URL.
 * Empty/null/undefined are considered valid (field is optional).
 */
export function isValidHttpUrl(value?: string | null): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    const u = new URL(trimmed);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}