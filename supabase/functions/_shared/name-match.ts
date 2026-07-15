// Fuzzy name-match guard for DigiLocker auto-approval.
//
// Balanced threshold (≥80%, ignores order/case/initials/punctuation).
// Returns a score in [0,1] plus a boolean derived from DEFAULT_THRESHOLD.
// Kept dependency-free so it can be imported from any edge function
// and unit-tested with `deno test`.

export const DEFAULT_THRESHOLD = 0.8;

const HONORIFICS = new Set([
  "mr", "mrs", "ms", "miss", "shri", "smt", "sri", "dr", "prof", "er",
]);

function normalize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    // strip diacritics
    .replace(/[\u0300-\u036f]/g, "")
    // punctuation / periods to space
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !HONORIFICS.has(t));
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) dp[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Token-set ratio-ish: expand initials against the other side's tokens. */
function tokenSetSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const expand = (src: string[], other: string[]): string[] =>
    src.map((t) => {
      if (t.length > 1) return t;
      // Single initial — match to any token in the other set starting with it
      const hit = other.find((o) => o.length > 1 && o[0] === t);
      return hit || t;
    });
  const A = new Set(expand(a, b));
  const B = new Set(expand(b, a));
  const inter = [...A].filter((x) => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  return union === 0 ? 0 : inter / union;
}

export interface NameMatchResult {
  score: number;
  matches: boolean;
  threshold: number;
  normalizedA: string;
  normalizedB: string;
}

export function matchNames(
  a: string | null | undefined,
  b: string | null | undefined,
  threshold = DEFAULT_THRESHOLD,
): NameMatchResult {
  const ta = normalize(a || "");
  const tb = normalize(b || "");
  const normalizedA = ta.join(" ");
  const normalizedB = tb.join(" ");
  if (!ta.length || !tb.length) {
    return { score: 0, matches: false, threshold, normalizedA, normalizedB };
  }
  // Order-insensitive: sort tokens before Levenshtein
  const sa = [...ta].sort().join(" ");
  const sb = [...tb].sort().join(" ");
  const dist = levenshtein(sa, sb);
  const lev = 1 - dist / Math.max(sa.length, sb.length);
  const tset = tokenSetSimilarity(ta, tb);
  // Take the more generous of the two — initials/subsets get help from
  // token set, typos get help from Levenshtein.
  const score = Math.max(lev, tset);
  return { score, matches: score >= threshold, threshold, normalizedA, normalizedB };
}

export interface BestNameMatchResult extends NameMatchResult {
  /** The candidate that produced the best score (raw, unnormalized). */
  matchedCandidate: string | null;
}

/**
 * Match `a` against several candidate names and return the BEST result.
 *
 * WHY: a customer's identity name lives in more than one field — the linked
 * portal contact's `full_name` (what the Customers list shows), the account's
 * `primary_contact_name`, and the order's `customer_name`. These drift apart
 * (e.g. an account created earlier under a different name, then reused). The
 * licence/doc only needs to match ONE of them to be the same person, so we
 * score against all non-empty candidates and keep the highest — approving on
 * the best available evidence instead of a single stale field.
 */
export function matchBestName(
  a: string | null | undefined,
  candidates: Array<string | null | undefined>,
  threshold = DEFAULT_THRESHOLD,
): BestNameMatchResult {
  const seen = new Set<string>();
  let best: BestNameMatchResult | null = null;
  for (const c of candidates) {
    const raw = (c || "").trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const r = matchNames(a, raw, threshold);
    if (!best || r.score > best.score) {
      best = { ...r, matchedCandidate: raw };
    }
  }
  return best ?? {
    score: 0,
    matches: false,
    threshold,
    normalizedA: "",
    normalizedB: "",
    matchedCandidate: null,
  };
}