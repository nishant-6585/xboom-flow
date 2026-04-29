/**
 * Fuzzy normalisation for company-name deduplication.
 * Strips legal suffixes, punctuation, whitespace and lowercases the result.
 * Two raw names that produce the same normalised key are considered the
 * same organisation (e.g. "XBoom Pvt. Ltd." === "Xboom").
 */
const LEGAL_SUFFIXES = [
  'private limited', 'pvt ltd', 'pvt limited', 'pvt. ltd.', 'pvt.ltd',
  'private ltd', 'p ltd', 'pltd',
  'limited', 'ltd', 'ltd.',
  'llp', 'l.l.p',
  'inc', 'inc.', 'incorporated',
  'llc', 'l.l.c',
  'corp', 'corporation', 'co', 'co.', 'company',
  'gmbh', 'sa', 's.a', 'srl', 's.r.l',
  'enterprises', 'enterprise', 'industries', 'industry',
  'group', 'holdings', 'solutions', 'services', 'systems',
  'technologies', 'technology', 'tech',
];

const SKIP_VALUES = new Set(['', 'unknown', 'n/a', 'na', 'none', '-', '--', 'null', 'test', 'xboom']);

export function normalizeCompanyName(input?: string | null): string {
  if (!input) return '';
  let s = String(input).toLowerCase().trim();
  // Remove anything in brackets
  s = s.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  // Replace punctuation with space
  s = s.replace(/[.,;:!?'"\\/_\-]+/g, ' ');
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  // Strip trailing legal suffixes (apply repeatedly e.g. "xyz pvt ltd")
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of LEGAL_SUFFIXES) {
      if (s.endsWith(' ' + suf)) { s = s.slice(0, -suf.length - 1).trim(); changed = true; }
      else if (s === suf) { s = ''; changed = true; }
    }
  }
  return s.replace(/\s+/g, ' ').trim();
}

export function isValidCompanyName(input?: string | null): boolean {
  const n = normalizeCompanyName(input);
  if (!n) return false;
  if (SKIP_VALUES.has(n)) return false;
  if (n.length < 2) return false;
  // Reject B2C order/enquiry numbers and phone-like strings.
  // A real company name must contain at least one letter.
  if (!/[a-z]/i.test(n)) return false;
  // Reject pure numeric or numeric-with-symbols
  if (/^[0-9\s\-+()]+$/.test(input || '')) return false;
  return true;
}

/** Title-case the canonical display name from the first occurrence. */
export function pickDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}
