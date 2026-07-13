// Light client-side defence for legacy or future WooCommerce plugin values
// that stash raw HTML in fields we render as plain text (e.g. payment_terms).
// Server-side sanitisation still runs on save — this is display-only.
export function stripHtmlLabel(input: unknown): string {
  if (typeof input !== "string") return "";
  if (input.indexOf("<") === -1) return input;
  return input
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/\s+/g, " ")
    .trim();
}