import type { LeadDisposition } from "./leadDispositions";

/**
 * Returns true when the row should be hidden because it has been qualified,
 * not-qualified or marked junk and the panel is in default (filtered) view.
 */
export function isTerminalDisposition(
  disposition: LeadDisposition | string | null | undefined,
): boolean {
  return (
    disposition === "qualified" ||
    disposition === "not_qualified" ||
    disposition === "junk"
  );
}

/**
 * Pass-through filter used by every source panel.
 * When `includeDispositioned` is false (default) terminal rows are removed.
 */
export function applyDispositionFilter<T>(
  rows: T[],
  includeDispositioned: boolean,
): T[] {
  if (includeDispositioned) return rows;
  return rows.filter(
    (r) =>
      !isTerminalDisposition(
        (r as { disposition?: LeadDisposition | string | null })?.disposition,
      ),
  );
}