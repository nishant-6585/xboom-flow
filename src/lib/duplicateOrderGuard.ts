/**
 * Global promise-based bridge between `useOrders.createOrder` and a mounted
 * `<DuplicateOrderGuardModal />`. Lets any code path that creates an order
 * present a consistent blocking / warning dialog without threading the modal
 * through every caller.
 */
import { supabase } from '@/integrations/supabase/client';

export interface DuplicateOrderMatch {
  id: string;
  order_number: string | null;
  source: string | null;
  external_id: string | null;
  sales_person_name: string | null;
  total_sales_amount: number | null;
  order_date: string | null;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  product_name: string | null;
  amount_diff_pct: number;
  days_apart?: number | null;
  match_reasons: string[];
}

export interface DuplicateOrderCheckInput {
  customer_name: string | null | undefined;
  customer_phone: string | null | undefined;
  product_name: string | null | undefined;
  product_code?: string | null;
  order_date?: string | null;
  total_sales_amount?: number | null;
}

export type DuplicateSeverity = 'hard' | 'repeat' | 'soft';
export type DuplicateDecision = 'proceed' | 'cancel';

export interface DuplicateOrderEventDetail {
  severity: DuplicateSeverity;
  matches: DuplicateOrderMatch[];
  triggerMessage?: string;
  resolve: (d: DuplicateDecision) => void;
}

const EVENT = 'duplicate-order-detected';

function isHardMatch(m: DuplicateOrderMatch): boolean {
  const has = (r: string) => m.match_reasons?.includes(r);
  const customer = has('same phone') || has('same customer name');
  const product = has('similar product') || has('same product code');
  const date = has('same date (±3d)');
  return customer && product && date && Number(m.amount_diff_pct ?? 100) <= 5;
}

function isRepeatMatch(m: DuplicateOrderMatch): boolean {
  // Same customer + same product, but OUTSIDE the ±3-day window.
  const has = (r: string) => m.match_reasons?.includes(r);
  const customer = has('same phone') || has('same customer name');
  const product = has('similar product') || has('same product code');
  const outsideDateWindow = !has('same date (±3d)');
  return customer && product && outsideDateWindow;
}

export function classifyMatches(matches: DuplicateOrderMatch[]): DuplicateSeverity | null {
  if (!matches?.length) return null;
  if (matches.some(isHardMatch)) return 'hard';
  if (matches.some(isRepeatMatch)) return 'repeat';
  return 'soft';
}

/**
 * Split matches into the two soft-severity buckets. Callers use this to
 * pick which subset to show inside the "repeat purchase" confirm dialog
 * vs. the generic "similar recent order" warning.
 */
export function filterRepeatMatches(matches: DuplicateOrderMatch[]): DuplicateOrderMatch[] {
  return (matches ?? []).filter(isRepeatMatch);
}

/**
 * Parse a Postgres trigger error whose message starts with `DUPLICATE_ORDER:`
 * into a synthetic match so the modal can present it uniformly.
 */
export function parseDuplicateTriggerError(msg: string): DuplicateOrderMatch | null {
  if (!msg || !msg.includes('DUPLICATE_ORDER:')) return null;
  const rx = /DUPLICATE_ORDER: matches ([^\s]+) \((\w+), created ([\d-]+), salesperson ([^)]+)\)\.[^\[]*\[([^\]]+)\]/;
  const m = msg.match(rx);
  if (!m) {
    return {
      id: '',
      order_number: '(existing order)',
      source: 'website',
      external_id: null,
      sales_person_name: null,
      total_sales_amount: null,
      order_date: null,
      created_at: new Date().toISOString(),
      customer_name: null,
      customer_phone: null,
      product_name: null,
      amount_diff_pct: 0,
      match_reasons: ['blocked by server'],
    };
  }
  const [, order_number, source, created, salesperson, reasons] = m;
  return {
    id: '',
    order_number,
    source,
    external_id: source === 'website' ? '(server-side match)' : null,
    sales_person_name: salesperson,
    total_sales_amount: null,
    order_date: null,
    created_at: new Date(created).toISOString(),
    customer_name: null,
    customer_phone: null,
    product_name: null,
    amount_diff_pct: 0,
    match_reasons: reasons.split(',').map((s) => s.trim()).filter(Boolean),
  };
}

export async function fetchDuplicateOrderMatches(input: DuplicateOrderCheckInput): Promise<DuplicateOrderMatch[]> {
  try {
    // deno-lint-ignore no-explicit-any
    const { data, error } = await (supabase.rpc as any)('find_duplicate_orders', {
      p_customer_name: input.customer_name ?? '',
      p_customer_phone: input.customer_phone ?? '',
      p_product_name: input.product_name ?? '',
      p_product_code: input.product_code ?? '',
      p_order_date: input.order_date ?? new Date().toISOString().slice(0, 10),
      p_total: input.total_sales_amount ?? 0,
    });
    if (error) {
      console.warn('find_duplicate_orders rpc failed', error);
      return [];
    }
    return (data ?? []) as DuplicateOrderMatch[];
  } catch (e) {
    console.warn('find_duplicate_orders exception', e);
    return [];
  }
}

/**
 * Fire the global event and wait for the modal to resolve. If no listener is
 * mounted (unlikely — modal is mounted in App), resolves as `proceed` for
 * soft matches and `cancel` for hard matches to be safe.
 */
export function presentDuplicateDialog(
  severity: DuplicateSeverity,
  matches: DuplicateOrderMatch[],
  triggerMessage?: string,
): Promise<DuplicateDecision> {
  return new Promise((resolve) => {
    let handled = false;
    const detail: DuplicateOrderEventDetail = {
      severity,
      matches,
      triggerMessage,
      resolve: (d) => { handled = true; resolve(d); },
    };
    window.dispatchEvent(new CustomEvent(EVENT, { detail }));
    // Safety fallback: if no listener is mounted, resolve after a tick.
    setTimeout(() => {
      if (!handled) resolve(severity === 'hard' ? 'cancel' : 'proceed');
    }, 100);
  });
}

export const DUPLICATE_ORDER_EVENT = EVENT;