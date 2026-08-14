/**
 * Display-level helpers for the unified lead feed.
 *
 * The `unified_lead_feed` view maps `product_name` and `subject_or_message`
 * to the same underlying column for Forms leads, and sets `product_name` to
 * the channel name for Interakt / MyOperator. Both are display artefacts, so
 * they are normalised here rather than in the view.
 */

const norm = (v: string | null | undefined) =>
  String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** True when two strings are equal ignoring case and whitespace. */
export function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = norm(a);
  return na.length > 0 && na === norm(b);
}

/**
 * Returns the product name, or null when it is really just the channel name
 * (e.g. an Interakt lead claiming its product is "Interakt").
 */
export function resolveProductName(
  productName: string | null | undefined,
  sourceLabels: (string | null | undefined)[],
): string | null {
  const value = String(productName ?? "").trim();
  if (!value) return null;
  if (sourceLabels.some((label) => sameText(value, label))) return null;
  return value;
}
