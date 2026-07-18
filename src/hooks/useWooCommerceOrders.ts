import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { WOO_ORDER_STATUSES } from '@/lib/wooOrderStatuses';

export interface WooCommerceOrder {
  id: string;
  woo_order_id: string;
  order_number: string | null;
  source: string;
  order_status: string | null;
  financial_status: string | null;
  fulfillment_status: string | null;
  product_name: string;
  product_code: string | null;
  product_category: string | null;
  quantity: number;
  customer_name: string;
  customer_company: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  shipping_address: string | null;
  selling_price: number | null;
  total_sales_amount: number | null;
  amount_paid: number | null;
  payment_status: string | null;
  currency: string | null;
  line_items: unknown;
  raw_data: unknown;
  internal_notes: string | null;
  sales_notes: string | null;
  woo_created_at: string | null;
  woo_updated_at: string | null;
  created_at: string;
  updated_at: string;
  tracking_status: string | null;
  tracking_number: string | null;
  courier: string | null;
  expected_delivery: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_at: string | null;
}

/**
 * Options to scope down the WooCommerce orders fetch.
 *
 * The full table now contains 20k+ rows, so callers that only need a slice
 * (e.g. the Xboom Website Leads panel) should pass `sinceDays` and/or
 * `leadOnly` to avoid downloading the entire history.
 */
export interface UseWooCommerceOrdersOptions {
  /** Only return orders with woo_created_at within the last N days. */
  sinceDays?: number;
  /** Only return rows whose order_status is NOT a fulfilled order status
   *  (i.e. only leads — pending, on-hold, failed, cancelled, refunded, …). */
  leadOnly?: boolean;
  /** Exclude rows that have been auto-marked as `is_lost_lead = true`
   *  (leads older than 90 days). Defaults to false to preserve existing
   *  callers (Orders page / analytics still see everything). */
  excludeLost?: boolean;
}

export function useWooCommerceOrders(options: UseWooCommerceOrdersOptions = {}) {
  const { sinceDays, leadOnly, excludeLost } = options;
  const [orders, setOrders] = useState<WooCommerceOrder[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ordersInvalidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  const fetchOrders = useCallback(async () => {
    // Prevent overlapping fetches — realtime can fire many events during a backfill
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      setLoading(true);

      // Only select fields the UI actually uses. raw_data + line_items are heavy
      // JSONB blobs that 5–10x the payload size and slow down both transfer and
      // JSON parsing in the browser.
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

      // First page also returns the exact count (single round-trip vs HEAD+SELECT).
      const batchSize = 2000;
      const sinceIso = sinceDays
        ? new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const buildQuery = (withCount: boolean) => {
        let q = supabase
          .from('woocommerce_orders')
          .select(LIST_COLUMNS, withCount ? { count: 'exact' } : undefined)
          .order('woo_created_at', { ascending: false, nullsFirst: false });
        if (sinceIso) q = q.gte('woo_created_at', sinceIso);
        if (leadOnly) {
          // Anything that isn't a fulfilled-order status is a lead.
          q = q.not(
            'order_status',
            'in',
            `(${(WOO_ORDER_STATUSES as readonly string[]).join(',')})`,
          );
        }
        if (excludeLost) {
          q = q.eq('is_lost_lead', false);
        }
        return q;
      };

      const first = await buildQuery(true).range(0, batchSize - 1);

      if (first.error) throw first.error;
      const total = first.count ?? 0;
      setTotalCount(total);
      const firstBatch = (first.data ?? []) as unknown as WooCommerceOrder[];

      // Fetch remaining pages in parallel instead of sequentially.
      const allOrders: WooCommerceOrder[] = [...firstBatch];
      if (total > batchSize) {
        const ranges: Array<[number, number]> = [];
        for (let from = batchSize; from < total; from += batchSize) {
          ranges.push([from, Math.min(from + batchSize - 1, total - 1)]);
        }
        const results = await Promise.all(
          ranges.map(([from, to]) =>
            buildQuery(false).range(from, to),
          ),
        );
        for (const r of results) {
          if (r.error) throw r.error;
          if (r.data) allOrders.push(...(r.data as unknown as WooCommerceOrder[]));
        }
      }

      console.log('[useWooCommerceOrders] Fetched orders from DB:', allOrders.length);
      setOrders(allOrders);
    } catch (error: unknown) {
      console.error('Error fetching WooCommerce orders:', error);
      toast({
        title: 'Error',
        description: 'Failed to load website orders',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [toast, sinceDays, leadOnly, excludeLost]);

  // Coalesce many realtime events (e.g. during a backfill) into a single refetch.
  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => {
      refetchTimerRef.current = null;
      fetchOrders();
      // The woo-mirror writes the INTERNAL orders row in the same webhook
      // that changed woocommerce_orders, so the internal list is stale too.
      // Refresh it here as well — the dedicated orders realtime channel can
      // lag or drop on this route, which left new website orders stuck as
      // the raw "incomplete" card until a manual page refresh. A second
      // invalidation shortly after covers a mirror that finishes late.
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      if (ordersInvalidateTimerRef.current) clearTimeout(ordersInvalidateTimerRef.current);
      ordersInvalidateTimerRef.current = setTimeout(() => {
        ordersInvalidateTimerRef.current = null;
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      }, 5000);
    }, 5000);
  }, [fetchOrders, queryClient]);

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel('woocommerce_orders_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'woocommerce_orders' }, () => {
        scheduleRefetch();
      })
      .subscribe();

    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      if (ordersInvalidateTimerRef.current) clearTimeout(ordersInvalidateTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchOrders, scheduleRefetch]);

  // Computed stats — memoized so they only recalc when orders actually change.
  // Single pass over the array instead of 6+ passes.
  const stats = useMemo(() => {
    const SUCCESS_STATUSES = ['completed', 'delivered'];
    const FAILED_STATUSES = ['failed', 'cancelled'];
    const PENDING_STATUSES = ['pending', 'on-hold'];

    const statusCounts: Record<string, number> = {};
    let successCount = 0, failedCount = 0, pendingCount = 0, processingCount = 0;
    let totalRevenue = 0, completedRevenue = 0, lostRevenue = 0;
    let lastSyncedAtMs = 0;
    let lastSyncedAt: string | null = null;
    let todayOrders = 0;
    const todayStr = new Date().toDateString();

    for (const o of orders) {
      const s = (o.order_status || 'unknown').toLowerCase();
      statusCounts[s] = (statusCounts[s] || 0) + 1;

      const amount = Number(o.total_sales_amount) || 0;
      const isFailed = FAILED_STATUSES.includes(s);
      const isSuccess = SUCCESS_STATUSES.includes(s);

      if (!isFailed) totalRevenue += amount;
      if (isSuccess) { completedRevenue += amount; successCount++; }
      if (isFailed) { lostRevenue += amount; failedCount++; }
      if (PENDING_STATUSES.includes(s)) pendingCount++;
      if (s === 'processing') processingCount++;

      const t = o.woo_updated_at || o.updated_at || o.created_at;
      if (t) {
        const ms = new Date(t).getTime();
        if (ms > lastSyncedAtMs) {
          lastSyncedAtMs = ms;
          lastSyncedAt = t;
        }
      }

      const d = o.woo_created_at || o.created_at;
      if (d && new Date(d).toDateString() === todayStr) todayOrders++;
    }

    return {
      totalOrders: orders.length,
      statusCounts,
      grouped: {
        success: successCount,
        failed: failedCount,
        pending: pendingCount,
        processing: processingCount,
      },
      revenue: {
        total: totalRevenue,
        completed: completedRevenue,
        lost: lostRevenue,
      },
      lastSyncedAt,
      completedOrders: statusCounts['completed'] || 0,
      processingOrders: statusCounts['processing'] || 0,
      pendingOrders: statusCounts['pending'] || 0,
      failedOrders: statusCounts['failed'] || 0,
      cancelledOrders: statusCounts['cancelled'] || 0,
      todayOrders,
    };
  }, [orders]);

  return {
    wooOrders: orders,
    totalCount,
    loading,
    stats,
    refetch: fetchOrders,
  };
}
