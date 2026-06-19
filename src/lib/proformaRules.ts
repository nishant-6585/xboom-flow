// Centralised GST-rate inference + line-item rules for XBoom proforma generation.
// Single source of truth so the dialog, regenerate flow and reconciliation view
// all reach the same answer for the same line.

export const DRONE_GST = 5;
export const STANDARD_GST = 18;

const ACCESSORY_RE = /(propeller|prop\b|blade|battery|batteries|charger|cable|cord|adapter|case|bag|backpack|strap|filter|nd\s*filter|lens|gimbal|remote\b|controller|antenna|landing\s*gear|guard|hood|mount|holder|memory|sd\s*card|spare|accessor)/i;

const SUBSCRIPTION_RE = /(subscription|annual\s*plan|care\s*refresh|care\s*plan|enterprise\s*shield|warranty\s*plan|maintenance\s*plan|amc\b|service\s*plan|terra\s*(pro|advanced|annual|1\s*year))/i;

const DRONE_RE = /\b(drones?|uav|quadcopter|matrice|mavic|phantom|inspire|agras|m3\b|m4\b|m30|m300|m350)\b/i;

/**
 * Pure category-based GST rate.
 *   - SAC codes 997xxx (services, e.g. subscriptions) → 18%
 *   - HSN 8806xxxx (drones) → 5% unless the description looks like an accessory
 *   - Subscription-style descriptions → 18%
 *   - Accessories → 18%
 *   - Drone-named items → 5%
 *   - Fallback → 18%
 */
export function inferGstRate(productName: string, hsn?: string | null): number {
  const name = (productName || '').toLowerCase();
  const code = (hsn || '').trim();

  // Services (SAC) are always 18% regardless of name.
  if (/^997\d{0,5}$/.test(code)) return STANDARD_GST;

  // Subscription/service keywords always 18% even without a SAC code.
  if (SUBSCRIPTION_RE.test(name)) return STANDARD_GST;

  // Accessories override the drone HSN family (DJI accessories often share 88062200).
  if (ACCESSORY_RE.test(name)) return STANDARD_GST;

  if (code.startsWith('8806')) return DRONE_GST;
  if (DRONE_RE.test(name)) return DRONE_GST;

  return STANDARD_GST;
}

/**
 * Resolve GST rate for a WooCommerce line_item payload.
 * Order of trust:
 *   1. subtotal_tax / subtotal → effective rate paid on Woo (snap to slabs)
 *   2. tax_class string (e.g. "18", "gst-18", "rate-5")
 *   3. SAC/HSN + name heuristic via inferGstRate()
 */
export function inferGstRateFromWooLine(it: any, hsn?: string | null): number {
  const sub = Number(it?.subtotal ?? 0);
  const subTax = Number(it?.subtotal_tax ?? 0);
  if (sub > 0 && subTax > 0) {
    const pct = (subTax / sub) * 100;
    const slabs = [0, 5, 12, 18, 28];
    const snapped = slabs.reduce((best, s) =>
      Math.abs(s - pct) < Math.abs(best - pct) ? s : best, slabs[0]);
    if (Math.abs(snapped - pct) <= 1) return snapped;
    return Math.round(pct);
  }
  const tc = String(it?.tax_class ?? '').trim();
  const m = tc.match(/(\d{1,2})/);
  if (m) {
    const n = Number(m[1]);
    if ([0, 3, 5, 12, 18, 28].includes(n)) return n;
  }
  return inferGstRate(it?.name || it?.product_name || '', hsn);
}

// ------------------------------ Deduplication ------------------------------

/** Bundle → list of component keywords that may be billed twice by mistake. */
const BUNDLE_COMPONENTS: Array<{ bundleRe: RegExp; component: RegExp; label: string }> = [
  { bundleRe: /\bcombo\b|\+\s*terra|with\s+terra|bundle/i, component: /\bterra\b/i, label: 'DJI Terra subscription' },
  { bundleRe: /care\s*combo|with\s+care/i, component: /care\s*refresh|care\s*plan/i, label: 'DJI Care Refresh' },
  { bundleRe: /shield\s*combo|with\s+shield/i, component: /enterprise\s*shield/i, label: 'Enterprise Shield' },
];

export interface DuplicateFlag {
  /** Index of the standalone line that is likely duplicated inside a bundle line. */
  duplicateIndex: number;
  /** Index of the bundle line that already includes the component. */
  bundleIndex: number;
  message: string;
}

export function detectBundleDuplicates(
  lines: Array<{ product_name: string }>,
): DuplicateFlag[] {
  const flags: DuplicateFlag[] = [];
  lines.forEach((line, i) => {
    const name = line.product_name || '';
    for (const rule of BUNDLE_COMPONENTS) {
      if (!rule.bundleRe.test(name)) continue;
      // Bundle contains the component name AND a separate line also matches it.
      if (!rule.component.test(name)) continue;
      lines.forEach((other, j) => {
        if (i === j) return;
        const otherName = other.product_name || '';
        if (rule.component.test(otherName) && !rule.bundleRe.test(otherName)) {
          flags.push({
            duplicateIndex: j,
            bundleIndex: i,
            message: `${rule.label} is already bundled in line ${i + 1}`,
          });
        }
      });
    }
  });
  return flags;
}

// ------------------------------ Reconciliation ------------------------------

export type ReconcileRule =
  | 'DOUBLE_TAX_ON_INCLUSIVE_RATE'
  | 'WRONG_GST_RATE'
  | 'DUPLICATE_BUNDLED_LINE'
  | 'AMOUNT_MISMATCH'
  | 'OK';

export interface ReconcileResult {
  proformaTotal: number;
  expectedTotal: number;
  delta: number;
  rules: Array<{ rule: ReconcileRule; detail: string }>;
}

/**
 * Compare the live proforma total against the expected total (Zoho invoice
 * total or amount actually paid) and attribute the delta to the most likely
 * rule violation. Lightweight — runs entirely in the browser.
 */
export function reconcileProforma(args: {
  lines: Array<{ product_name: string; hsn?: string | null; quantity: number; gross_total: number; gst_rate: number }>;
  proformaTotal: number;
  expectedTotal: number;
}): ReconcileResult {
  const { lines, proformaTotal, expectedTotal } = args;
  const delta = Math.round((proformaTotal - expectedTotal) * 100) / 100;
  const rules: ReconcileResult['rules'] = [];

  // 1. Double-tax detection — if SUM(gross) ≈ expectedTotal × (1 + avg_rate),
  //    the user likely entered already-GST-inclusive amounts as taxable.
  if (expectedTotal > 0 && delta > 0) {
    const sumGross = lines.reduce((s, l) => s + (Number(l.gross_total) || 0), 0);
    const avgRate = lines.length
      ? lines.reduce((s, l) => s + (Number(l.gst_rate) || 0), 0) / lines.length
      : 0;
    const expectedIfDoubleTaxed = expectedTotal * (1 + avgRate / 100);
    if (Math.abs(sumGross - expectedIfDoubleTaxed) / expectedTotal < 0.01) {
      rules.push({
        rule: 'DOUBLE_TAX_ON_INCLUSIVE_RATE',
        detail: `Line rates appear to already include GST; ${avgRate.toFixed(1)}% was added on top (extra ₹${delta.toLocaleString('en-IN')}).`,
      });
    }
  }

  // 2. Wrong GST rate — flag any line whose chosen rate disagrees with inferGstRate().
  lines.forEach((l, idx) => {
    const expected = inferGstRate(l.product_name, l.hsn || undefined);
    if (expected !== Number(l.gst_rate)) {
      rules.push({
        rule: 'WRONG_GST_RATE',
        detail: `Line ${idx + 1} "${l.product_name}" — using ${l.gst_rate}%, expected ${expected}% (HSN ${l.hsn || '—'}).`,
      });
    }
  });

  // 3. Duplicate bundled lines.
  for (const flag of detectBundleDuplicates(lines)) {
    rules.push({
      rule: 'DUPLICATE_BUNDLED_LINE',
      detail: `Line ${flag.duplicateIndex + 1}: ${flag.message}.`,
    });
  }

  if (Math.abs(delta) <= 1 && rules.length === 0) {
    rules.push({ rule: 'OK', detail: 'Totals match within ₹1.' });
  } else if (rules.length === 0 && Math.abs(delta) > 1) {
    rules.push({
      rule: 'AMOUNT_MISMATCH',
      detail: `Total differs by ₹${delta.toLocaleString('en-IN')} but no specific rule was triggered. Check line amounts manually.`,
    });
  }

  return { proformaTotal, expectedTotal, delta, rules };
}