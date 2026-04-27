import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface WooCommerceOrder {
  id: string;
  woo_order_id: string;
  order_number: string | null;
  source: string;
  /** "orders" → paid/processing/completed; "abandoned" → pending/failed/cancelled */
  bucket: 'orders' | 'abandoned';
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
}

export function useWooCommerceOrders() {
  const [orders, setOrders] = useState<WooCommerceOrder[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');
  const lastSyncRef = useRef<number>(0);
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

  const syncFromAPI = useCallback(async () => {
    // Debounce: prevent re-sync within 30 seconds
    const now = Date.now();
    if (now - lastSyncRef.current < 30000) {
      toast({
        title: 'Please wait',
        description: 'Sync was triggered recently. Please wait 30 seconds.',
      });
      return;
    }

    try {
      setSyncing(true);
      setSyncProgress('Starting sync...');
      lastSyncRef.current = now;

      const { data, error } = await supabase.functions.invoke('sync-website-orders', {
        method: 'POST',
      });

      if (error) throw error;

      console.log('[useWooCommerceOrders] Sync result:', data);

      if (data?.success === false) {
        toast({
          title: 'Sync Warning',
          description: data?.error || 'API returned an error',
          variant: 'destructive',
        });
        return;
      }

      setSyncProgress(`Synced ${data?.upserted || 0} orders across ${data?.pages_fetched || 1} pages`);

      toast({
        title: 'Sync Complete',
        description: data?.message || `Synced ${data?.upserted || 0} orders`,
      });

      await fetchOrders();
    } catch (error: unknown) {
      console.error('[useWooCommerceOrders] Sync error:', error);
      toast({
        title: 'Sync Error',
        description: 'Failed to sync orders from xboom.in',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncProgress(''), 5000);
    }
  }, [toast, fetchOrders]);

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

  // Computed stats
  const stats = {
    totalOrders: orders.filter(o => o.bucket === 'orders').length,
    totalAbandoned: orders.filter(o => o.bucket === 'abandoned').length,
    totalRevenue: orders
      .filter(o => o.bucket === 'orders')
      .reduce((sum, o) => sum + (o.total_sales_amount || 0), 0),
    abandonedValue: orders
      .filter(o => o.bucket === 'abandoned')
      .reduce((sum, o) => sum + (o.total_sales_amount || 0), 0),
    completedOrders: orders.filter(o => o.order_status === 'completed').length,
    processingOrders: orders.filter(o => o.order_status === 'processing').length,
    todayOrders: orders.filter(o => {
      const d = o.woo_created_at || o.created_at;
      if (!d) return false;
      const orderDate = new Date(d).toDateString();
      return orderDate === new Date().toDateString();
    }).length,
  };

  // Split by bucket so Orders & Abandoned tabs each consume their own slice.
  // Normalize bucket so trailing whitespace / casing never causes filter mismatches.
  const normalizedBucket = (b: unknown): 'orders' | 'abandoned' | 'unknown' => {
    const v = String(b ?? '').trim().toLowerCase();
    if (v === 'orders') return 'orders';
    if (v === 'abandoned') return 'abandoned';
    return 'unknown';
  };
  const orderBucketRows = orders.filter(o => normalizedBucket(o.bucket) === 'orders');
  const abandonedBucketRows = orders.filter(o => normalizedBucket(o.bucket) === 'abandoned');

  return {
    wooOrders: orders,
    orderBucketRows,
    abandonedBucketRows,
    totalCount,
    loading,
    syncing,
    syncProgress,
    stats,
    refetch: fetchOrders,
    syncFromAPI,
  };
}
