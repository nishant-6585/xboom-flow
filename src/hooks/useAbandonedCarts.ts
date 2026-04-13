import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface AbandonedCart {
  id: string;
  session_id: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  cart_items: unknown;
  cart_value: number;
  currency: string | null;
  source: string | null;
  status: string;
  recovered_order_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useAbandonedCarts() {
  const [carts, setCarts] = useState<AbandonedCart[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchCarts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('abandoned_carts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setCarts((data as AbandonedCart[]) || []);
    } catch (error: unknown) {
      console.error('Error fetching abandoned carts:', error);
      toast({
        title: 'Error',
        description: 'Failed to load abandoned carts',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCarts();

    const channel = supabase
      .channel('abandoned_carts_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'abandoned_carts' }, () => {
        fetchCarts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const stats = {
    total: carts.length,
    active: carts.filter(c => c.status === 'active').length,
    recovered: carts.filter(c => c.status === 'recovered').length,
    expired: carts.filter(c => c.status === 'expired').length,
    totalValue: carts.filter(c => c.status === 'active').reduce((sum, c) => sum + (c.cart_value || 0), 0),
    recoveredValue: carts.filter(c => c.status === 'recovered').reduce((sum, c) => sum + (c.cart_value || 0), 0),
  };

  return { carts, loading, stats, refetch: fetchCarts };
}
