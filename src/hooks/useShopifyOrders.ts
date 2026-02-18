import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ShopifyOrder {
  id: string;
  shopify_order_id: string;
  shop_domain: string;
  order_number: string | null;
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
  fulfillment_status: string | null;
  financial_status: string | null;
  order_status: string | null;
  currency: string | null;
  line_items: unknown;
  internal_notes: string | null;
  sales_notes: string | null;
  tags: string | null;
  shopify_created_at: string | null;
  shopify_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useShopifyOrders() {
  const [shopifyOrders, setShopifyOrders] = useState<ShopifyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchShopifyOrders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('shopify_orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5000);

      if (error) throw error;
      setShopifyOrders(data || []);
    } catch (error: unknown) {
      console.error('Error fetching Shopify orders:', error);
      toast({
        title: 'Error',
        description: 'Failed to load Shopify orders',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShopifyOrders();

    // Realtime subscription
    const channel = supabase
      .channel('shopify_orders_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopify_orders' }, () => {
        fetchShopifyOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { shopifyOrders, loading, refetch: fetchShopifyOrders };
}
