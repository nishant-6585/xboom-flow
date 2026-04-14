import { useState, useEffect } from 'react';
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
}

export function useWooCommerceOrders() {
  const [orders, setOrders] = useState<WooCommerceOrder[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  const fetchOrders = async () => {
    try {
      setLoading(true);

      const { count, error: countError } = await supabase
        .from('woocommerce_orders')
        .select('id', { count: 'exact', head: true });

      if (countError) throw countError;
      setTotalCount(count ?? 0);

      const { data, error } = await supabase
        .from('woocommerce_orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;
      console.log('[useWooCommerceOrders] Fetched orders from DB:', data?.length ?? 0);
      setOrders((data as WooCommerceOrder[]) || []);
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
  };

  const syncFromAPI = async () => {
    try {
      setSyncing(true);
      console.log('[useWooCommerceOrders] Triggering sync from xboom.in API...');
      
      const { data, error } = await supabase.functions.invoke('sync-website-orders', {
        method: 'POST',
      });

      if (error) throw error;

      console.log('[useWooCommerceOrders] Sync result:', data);
      
      toast({
        title: 'Sync Complete',
        description: data?.message || `Synced ${data?.upserted || 0} orders from xboom.in`,
      });

      // Refetch from DB after sync
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
    }
  };

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
  }, []);

  return { wooOrders: orders, totalCount, loading, syncing, refetch: fetchOrders, syncFromAPI };
}
