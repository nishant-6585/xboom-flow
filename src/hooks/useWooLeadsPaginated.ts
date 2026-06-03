import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { WOO_ORDER_STATUSES } from '@/lib/wooOrderStatuses';

/**
 * Cutover for mirroring website orders into the internal Orders tab.
 * Processing orders dated BEFORE this never made it across, so we surface
 * them in the Leads tab instead (so the team can still action them).
 */
const WEBSITE_ORDER_CUTOFF_ISO = '2026-04-30T00:00:00Z';
import type { WooCommerceOrder } from './useWooCommerceOrders';

/**
 * Server-paginated WooCommerce leads (Xboom Website panel).
 *
 * Unlike `useWooCommerceOrders`, this hook only fetches ONE page at a time
 * and pushes search / status filters down to Postgres so we never download
 * the full lead history just to render 50 rows.
 */
export interface UseWooLeadsPaginatedOptions {
  page: number;        // 1-based
  pageSize: number;    // rows per page
  search?: string;     // free-text across order #, customer, email, phone, product
  status?: string;     // 'all' | one of the lead statuses
  sinceDays?: number;  // optional time window
  excludeLost?: boolean;
  assignedTo?: string; // restrict to a specific assignee user_id (sales rep scope)
}

export interface WooLeadStats {
  total: number;
  counts: Record<string, number>;
  lostValue: number;
}

const LIST_COLUMNS = [
  'id',
  'woo_order_id',
  'order_number',
  'source',
  'order_status',
  'financial_status',
  'fulfillment_status',
  'product_name',
  'product_category',
  'quantity',
  'customer_name',
  'customer_company',
  'customer_email',
  'customer_phone',
  'selling_price',
  'total_sales_amount',
  'amount_paid',
  'payment_status',
  'currency',
  'woo_created_at',
  'woo_updated_at',
  'created_at',
  'updated_at',
  'assigned_to',
  'assigned_to_name',
  'assigned_at',
].join(',');

export function useWooLeadsPaginated(opts: UseWooLeadsPaginatedOptions) {
  const { page, pageSize, search = '', status = 'all', sinceDays, excludeLost, assignedTo } = opts;

  const [rows, setRows] = useState<WooCommerceOrder[]>([]);
  const [filteredCount, setFilteredCount] = useState(0);
  const [stats, setStats] = useState<WooLeadStats>({ total: 0, counts: {}, lostValue: 0 });
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const { toast } = useToast();

  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const debouncedSearch = useDebounced(search, 300);

  const sinceIso = useMemo(
    () =>
      sinceDays
        ? new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString()
        : null,
    [sinceDays],
  );

  const buildBaseQuery = useCallback(
    (selectExpr: string, withCount: boolean) => {
      let q = supabase
        .from('woocommerce_orders')
        .select(selectExpr, withCount ? { count: 'exact' } : undefined);

      // Lead-only: exclude fulfilled order statuses (completed / delivered),
      // and exclude `processing` ONLY when it falls within the post-cutover
      // window (those rows live in the internal Orders tab instead).
      // i.e. a row is a lead if EITHER:
      //   - status is not in WOO_ORDER_STATUSES, OR
      //   - status = 'processing' AND woo_created_at < cutoff
      q = q.or(
        [
          `order_status.not.in.(${(WOO_ORDER_STATUSES as readonly string[]).join(',')})`,
          `and(order_status.eq.processing,woo_created_at.lt.${WEBSITE_ORDER_CUTOFF_ISO})`,
        ].join(','),
      );

      if (sinceIso) q = q.gte('woo_created_at', sinceIso);
      if (excludeLost) q = q.eq('is_lost_lead', false);
      if (status && status !== 'all') q = q.eq('order_status', status);
      if (assignedTo) q = q.eq('assigned_to', assignedTo);

      if (debouncedSearch.trim()) {
        const term = debouncedSearch.trim().replace(/[%,]/g, '');
        const like = `%${term}%`;
        // Postgres OR across the searchable text columns
        q = q.or(
          [
            `order_number.ilike.${like}`,
            `woo_order_id.ilike.${like}`,
            `customer_name.ilike.${like}`,
            `customer_email.ilike.${like}`,
            `customer_phone.ilike.${like}`,
            `product_name.ilike.${like}`,
          ].join(','),
        );
      }

      return q;
    },
    [sinceIso, excludeLost, status, debouncedSearch, assignedTo],
  );

  const fetchPage = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      setLoading(true);
      const from = Math.max(0, (page - 1) * pageSize);
      const to = from + pageSize - 1;

      const res = await buildBaseQuery(LIST_COLUMNS, true)
        .order('woo_created_at', { ascending: false, nullsFirst: false })
        .range(from, to);

      if (res.error) throw res.error;
      setRows((res.data ?? []) as unknown as WooCommerceOrder[]);
      setFilteredCount(res.count ?? 0);
    } catch (err) {
      console.error('[useWooLeadsPaginated] fetchPage failed', err);
      toast({
        title: 'Error',
        description: 'Failed to load website leads',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [buildBaseQuery, page, pageSize, toast]);

  // Stats are independent of page / search — depend only on time window + lost flag.
  const fetchStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      // Lightweight aggregate: pull just status + amount for the lead set.
      let q = supabase
        .from('woocommerce_orders')
        .select('order_status, total_sales_amount')
        .or(
          [
            `order_status.not.in.(${(WOO_ORDER_STATUSES as readonly string[]).join(',')})`,
            `and(order_status.eq.processing,woo_created_at.lt.${WEBSITE_ORDER_CUTOFF_ISO})`,
          ].join(','),
        );
      if (sinceIso) q = q.gte('woo_created_at', sinceIso);
      if (excludeLost) q = q.eq('is_lost_lead', false);
      if (assignedTo) q = q.eq('assigned_to', assignedTo);

      // Stats set is small (last 60–90 days of leads). Cap defensively.
      const { data, error } = await q.limit(5000);
      if (error) throw error;

      const counts: Record<string, number> = {};
      let lostValue = 0;
      for (const r of data ?? []) {
        const s = (r.order_status || '').toLowerCase();
        counts[s] = (counts[s] || 0) + 1;
        lostValue += Number(r.total_sales_amount) || 0;
      }
      setStats({ total: (data ?? []).length, counts, lostValue });
    } catch (err) {
      console.error('[useWooLeadsPaginated] fetchStats failed', err);
    } finally {
      setStatsLoading(false);
    }
  }, [sinceIso, excludeLost, assignedTo]);

  // Coalesce realtime bursts
  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => {
      refetchTimerRef.current = null;
      fetchPage();
      fetchStats();
    }, 5000);
  }, [fetchPage, fetchStats]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    const channel = supabase
      .channel('woo_leads_paginated_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'woocommerce_orders' },
        () => scheduleRefetch(),
      )
      .subscribe();
    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [scheduleRefetch]);

  return {
    rows,
    filteredCount,
    stats,
    loading,
    statsLoading,
    refetch: () => {
      fetchPage();
      fetchStats();
    },
  };
}

/** Tiny inline debounce hook to avoid adding a dependency. */
function useDebounced<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}