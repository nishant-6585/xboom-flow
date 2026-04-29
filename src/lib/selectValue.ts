/**
 * Shared helpers for Radix Select values.
 *
 * Radix forbids empty-string values on <Select.Item /> because "" is reserved
 * for "cleared" state. These helpers ensure empty / nullish values never
 * leak into form state, query params, or backend payloads.
 */

/** Sentinel used by the SelectItem guard for empty values. */
export const EMPTY_SELECT_SENTINEL = "__empty__";

/** True when a value is safe to persist (non-empty, non-sentinel string). */
export function isValidSelectValue(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value !== EMPTY_SELECT_SENTINEL;
}

/**
 * Wrap a Select onValueChange handler so empty / sentinel values are dropped
 * (or replaced with a fallback) before reaching form state.
 *
 * @example
 *   <Select onValueChange={sanitizeSelectChange(setStatus)} />
 *   <Select onValueChange={sanitizeSelectChange(setTier, "all")} />
 */
export function sanitizeSelectChange<T extends string = string>(
  setter: (value: T) => void,
  fallback?: T,
): (value: string) => void {
  return (value: string) => {
    if (isValidSelectValue(value)) {
      setter(value as T);
      return;
    }
    if (fallback !== undefined) {
      setter(fallback);
    }
    // Otherwise: silently drop — caller chose not to allow clearing.
  };
}

/** Strip empty / sentinel values before sending to the backend. */
export function cleanSelectValue(value: string | null | undefined): string | null {
  return isValidSelectValue(value) ? value : null;
}