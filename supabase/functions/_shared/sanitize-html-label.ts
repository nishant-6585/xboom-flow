// Pure helpers to convert HTML fragments (e.g. WooCommerce
// `payment_method_title` values injected by gateway plugins) into
// plain-text labels that are safe to persist and display.
//
// Runs in Deno / edge — no DOM APIs, no external deps.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_m, ref: string) => {
    if (ref.startsWith("#x") || ref.startsWith("#X")) {
      const code = parseInt(ref.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _m;
    }
    if (ref.startsWith("#")) {
      const code = parseInt(ref.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _m;
    }
    const key = ref.toLowerCase();
    return key in NAMED_ENTITIES ? NAMED_ENTITIES[key] : _m;
  });
}

function stripTags(input: string): string {
  // Remove script/style content entirely, then all remaining tags.
  return input
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ");
}

function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

const GATEWAY_ALIASES: Record<string, string> = {
  snapmint: "Snapmint",
  razorpay: "Razorpay",
  payu: "PayU",
  ccavenue: "CCAvenue",
  paytm: "Paytm",
  phonepe: "PhonePe",
  stripe: "Stripe",
  cashfree: "Cashfree",
  instamojo: "Instamojo",
  billdesk: "BillDesk",
};

function titleCaseSlug(slug: string): string {
  if (!slug) return slug;
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

// Best-effort gateway name extraction from the FIRST <img> in the raw HTML.
// Looks at alt text, then hostname's second-level domain.
function detectGatewayName(rawHtml: string): string | null {
  const imgMatch = rawHtml.match(/<img\b[^>]*>/i);
  if (!imgMatch) return null;
  const tag = imgMatch[0];

  const altMatch = tag.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i);
  const altText = collapseWhitespace(decodeEntities(altMatch?.[1] ?? altMatch?.[2] ?? altMatch?.[3] ?? ""));
  if (altText) {
    const altLower = altText.toLowerCase();
    for (const [key, label] of Object.entries(GATEWAY_ALIASES)) {
      if (altLower.includes(key)) return label;
    }
  }

  const srcMatch = tag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i);
  const src = srcMatch?.[1] ?? srcMatch?.[2] ?? srcMatch?.[3] ?? "";
  if (!src) return altText || null;
  try {
    const url = new URL(src, "https://placeholder.local");
    const host = url.hostname.toLowerCase();
    if (!host || host === "placeholder.local") return altText || null;
    for (const key of Object.keys(GATEWAY_ALIASES)) {
      if (host.includes(key)) return GATEWAY_ALIASES[key];
    }
    // Fallback: second-level domain, capitalized.
    const parts = host.split(".").filter(Boolean);
    const sld = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    return titleCaseSlug(sld);
  } catch {
    return altText || null;
  }
}

export function htmlToLabel(raw: unknown, fallback?: string | null): string {
  const source = typeof raw === "string" ? raw : "";
  const stripped = collapseWhitespace(decodeEntities(stripTags(source)));

  if (!stripped) {
    const fb = typeof fallback === "string" ? fallback.trim() : "";
    return fb;
  }

  // Gateway recovery — only when the original HTML carried an <img>.
  if (/<img\b/i.test(source)) {
    const gateway = detectGatewayName(source);
    if (gateway && !stripped.toLowerCase().includes(gateway.toLowerCase())) {
      return `${stripped} — Pay via ${gateway}`;
    }
  }

  return stripped;
}