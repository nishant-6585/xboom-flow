import type { Company } from '@/hooks/useCompanies';

export type Bucket = 'A' | 'B' | 'C';

export interface BucketInfo {
  bucket: Bucket;
  label: string;
  // Tailwind classes for badge background/text
  badgeClass: string;
  // Solid hex/HSL for charts
  color: string;
}

export const BUCKET_META: Record<Bucket, BucketInfo> = {
  A: { bucket: 'A', label: 'High Value', badgeClass: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30', color: 'hsl(152 60% 45%)' },
  B: { bucket: 'B', label: 'Mid Value',  badgeClass: 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30',     color: 'hsl(38 92% 50%)'  },
  C: { bucket: 'C', label: 'Low Value',  badgeClass: 'bg-slate-500/20 text-slate-700 dark:text-slate-400 border border-slate-500/30',     color: 'hsl(215 16% 55%)' },
};

/**
 * Pareto / ABC classification by total_order_value.
 * Sort companies desc by value, accumulate share:
 *   A: companies contributing first 70% of revenue
 *   B: next 20% (cumulative 70-90%)
 *   C: remaining 10% (and all zero-value companies)
 */
export function classifyCompanies(companies: Company[]): Map<string, Bucket> {
  const map = new Map<string, Bucket>();
  if (!companies.length) return map;

  const total = companies.reduce((s, c) => s + (c.total_order_value || 0), 0);
  if (total <= 0) {
    companies.forEach(c => map.set(c.id, 'C'));
    return map;
  }

  const sorted = [...companies].sort((a, b) => (b.total_order_value || 0) - (a.total_order_value || 0));
  let cum = 0;
  for (const c of sorted) {
    const share = (c.total_order_value || 0) / total;
    const before = cum;
    cum += share;
    let bucket: Bucket;
    if ((c.total_order_value || 0) <= 0) bucket = 'C';
    else if (before < 0.7) bucket = 'A';
    else if (before < 0.9) bucket = 'B';
    else bucket = 'C';
    map.set(c.id, bucket);
  }
  return map;
}

export interface BucketStats {
  bucket: Bucket;
  count: number;
  value: number;
  countPct: number;
  valuePct: number;
}

export function bucketStats(companies: Company[], classification: Map<string, Bucket>): BucketStats[] {
  const totalValue = companies.reduce((s, c) => s + (c.total_order_value || 0), 0) || 1;
  const totalCount = companies.length || 1;
  const buckets: Bucket[] = ['A', 'B', 'C'];
  return buckets.map(b => {
    const list = companies.filter(c => classification.get(c.id) === b);
    const value = list.reduce((s, c) => s + (c.total_order_value || 0), 0);
    return {
      bucket: b,
      count: list.length,
      value,
      countPct: (list.length / totalCount) * 100,
      valuePct: (value / totalValue) * 100,
    };
  });
}