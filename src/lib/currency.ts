/**
 * Shared currency formatting and multi-currency aggregation.
 *
 * Before this module every screen re-implemented `₹${n.toLocaleString()}` or its
 * own local `formatINR`, which is how the Imports stat card ended up rendering an
 * INR total with a hardcoded `$`. Import anything you need from here instead.
 */

export type CurrencyCode = string;

/** Currencies the business actually transacts in. INR first — it is the base. */
export const CURRENCY_CODES = ['INR', 'USD', 'EUR', 'GBP', 'CNY', 'AED'] as const;

/** Every amount in the system is INR unless a row explicitly says otherwise. */
export const BASE_CURRENCY = 'INR';

const SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  CNY: '¥',
  AED: 'AED ',
};

/** Locale that produces the right digit grouping for a currency (lakh/crore for INR). */
const LOCALES: Record<string, string> = {
  INR: 'en-IN',
};

export function getCurrencySymbol(currency: CurrencyCode = BASE_CURRENCY): string {
  return SYMBOLS[currency?.toUpperCase()] ?? `${currency} `;
}

export interface FormatCurrencyOptions {
  /** Decimal places. Defaults to 0 — procurement figures are whole-rupee. */
  decimals?: number;
  /** Render 12,50,000 as "₹12.5L". Useful for chart axes and dense tables. */
  compact?: boolean;
  /** What to render for null/undefined/NaN. Defaults to a dash. */
  fallback?: string;
}

/**
 * Format an amount in its own currency. Never assume the currency — pass it.
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency: CurrencyCode = BASE_CURRENCY,
  options: FormatCurrencyOptions = {}
): string {
  const { decimals = 0, compact = false, fallback = '—' } = options;

  if (amount === null || amount === undefined || Number.isNaN(amount)) return fallback;

  const code = (currency || BASE_CURRENCY).toUpperCase();
  const locale = LOCALES[code] ?? 'en-US';

  if (compact) {
    return `${getCurrencySymbol(code)}${compactNumber(amount, code)}`;
  }

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    // Intl throws on codes it does not know — degrade rather than crash a table.
    return `${getCurrencySymbol(code)}${amount.toLocaleString(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  }
}

/** Shorthand for the common case. Equivalent to formatCurrency(n, 'INR'). */
export function formatINR(
  amount: number | null | undefined,
  options: FormatCurrencyOptions = {}
): string {
  return formatCurrency(amount, BASE_CURRENCY, options);
}

/**
 * Indian numbering for INR (K/L/Cr), western short scale for everything else.
 * Chart axes only — never use compact form for a figure someone will reconcile.
 */
function compactNumber(amount: number, currency: CurrencyCode): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  const trim = (n: number) => n.toFixed(n < 10 ? 1 : 0).replace(/\.0$/, '');

  if (currency === 'INR') {
    if (abs >= 1e7) return `${sign}${trim(abs / 1e7)}Cr`;
    if (abs >= 1e5) return `${sign}${trim(abs / 1e5)}L`;
    if (abs >= 1e3) return `${sign}${trim(abs / 1e3)}K`;
  } else {
    if (abs >= 1e9) return `${sign}${trim(abs / 1e9)}B`;
    if (abs >= 1e6) return `${sign}${trim(abs / 1e6)}M`;
    if (abs >= 1e3) return `${sign}${trim(abs / 1e3)}K`;
  }
  return `${sign}${abs.toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US')}`;
}

/** Totals keyed by currency code. */
export type CurrencyTotals = Record<CurrencyCode, number>;

/**
 * Sum a mixed-currency collection WITHOUT silently adding rupees to dollars.
 *
 * Returns one bucket per currency. Collapse to a single figure only once the row
 * carries an FX rate — until then, show the buckets.
 */
export function sumByCurrency<T>(
  rows: readonly T[],
  getAmount: (row: T) => number | null | undefined,
  getCurrency: (row: T) => CurrencyCode | null | undefined
): CurrencyTotals {
  return rows.reduce<CurrencyTotals>((totals, row) => {
    const amount = getAmount(row);
    if (!amount) return totals;
    const code = (getCurrency(row) || BASE_CURRENCY).toUpperCase();
    totals[code] = (totals[code] ?? 0) + amount;
    return totals;
  }, {});
}

/**
 * Render currency buckets for a stat card: the largest bucket in full, the rest
 * as a "+2 more" hint. Pair with `describeCurrencyTotals` for the tooltip.
 */
export function formatCurrencyTotals(
  totals: CurrencyTotals,
  options: FormatCurrencyOptions = {}
): { primary: string; extraCount: number } {
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return { primary: formatCurrency(0, BASE_CURRENCY, options), extraCount: 0 };
  }

  const [code, amount] = entries[0];
  return {
    primary: formatCurrency(amount, code, options),
    extraCount: entries.length - 1,
  };
}

/** Every bucket, one per line — for the tooltip behind a "+N more". */
export function describeCurrencyTotals(
  totals: CurrencyTotals,
  options: FormatCurrencyOptions = {}
): string {
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([code, amount]) => formatCurrency(amount, code, options))
    .join('\n');
}
