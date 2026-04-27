import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
}

export function useWooCommerceOrders() {
  const [orders, setOrders] = useState<WooCommerceOrder[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);

      // Get total count
      const { count, error: countError } = await supabase
        .from('woocommerce_orders')
        .select('id', { count: 'exact', head: true });

      if (countError) throw countError;
      setTotalCount(count ?? 0);

      // Fetch all orders (paginated from DB if needed)
      const allOrders: WooCommerceOrder[] = [];
      let from = 0;
      const batchSize = 1000;
      let keepGoing = true;

      while (keepGoing) {
        const { data, error } = await supabase
          .from('woocommerce_orders')
          .select('*')
          .order('woo_created_at', { ascending: false, nullsFirst: false })
          .range(from, from + batchSize - 1);

        if (error) throw error;
        if (data) allOrders.push(...(data as WooCommerceOrder[]));
        if (!data || data.length < batchSize) keepGoing = false;
        else from += batchSize;
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
    }
  }, [toast]);

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel('woocommerce_orders_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'woocommerce_orders' }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrders]);

  // Computed stats — single source of truth = WooCommerce status
  // Build a dynamic per-status count map so the UI can mirror WooCommerce 1:1
  // (no hard-coded status list — picks up custom statuses like delivered, return-requested, etc.)
  const statusCounts: Record<string, number> = {};
  for (const o of orders) {
    const s = (o.order_status || 'unknown').toLowerCase();
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }

  // Grouped status buckets for a clearer business-friendly UI
  // Success = completed + delivered
  // Failed  = failed + cancelled
  // Pending = pending + on-hold
  const SUCCESS_STATUSES = ['completed', 'delivered'];
  const FAILED_STATUSES = ['failed', 'cancelled'];
  const PENDING_STATUSES = ['pending', 'on-hold'];
  const PROCESSING_STATUSES = ['processing'];

  const sumStatuses = (keys: string[]) =>
    keys.reduce((acc, k) => acc + (statusCounts[k] || 0), 0);

  const sumRevenue = (keys: string[]) =>
    orders.reduce((acc, o) => {
      const s = (o.order_status || '').toLowerCase();
      if (!keys.includes(s)) return acc;
      return acc + (Number(o.total_sales_amount) || 0);
    }, 0);

  const totalRevenue = orders.reduce(
    (acc, o) => acc + (Number(o.total_sales_amount) || 0),
    0,
  );
  const completedRevenue = sumRevenue(SUCCESS_STATUSES);
  const lostRevenue = sumRevenue(FAILED_STATUSES);

  // Latest sync timestamp (most recent woo_updated_at / created_at in DB)
  let lastSyncedAt: string | null = null;
  for (const o of orders) {
    const t = o.woo_updated_at || o.updated_at || o.created_at;
    if (!t) continue;
    if (!lastSyncedAt || new Date(t) > new Date(lastSyncedAt)) {
      lastSyncedAt = t;
    }
  }

  const todayStr = new Date().toDateString();
  const stats = {
    totalOrders: orders.length,
    statusCounts,
    grouped: {
      success: sumStatuses(SUCCESS_STATUSES),
      failed: sumStatuses(FAILED_STATUSES),
      pending: sumStatuses(PENDING_STATUSES),
      processing: sumStatuses(PROCESSING_STATUSES),
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
    todayOrders: orders.filter(o => {
      const d = o.woo_created_at || o.created_at;
      if (!d) return false;
      return new Date(d).toDateString() === todayStr;
    }).length,
  };

  return {
    wooOrders: orders,
    totalCount,
    loading,
    stats,
    refetch: fetchOrders,
  };
}
