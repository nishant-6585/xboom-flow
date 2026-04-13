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
  contacted_at: string | null;
  recovery_emails_sent: number;
  last_contacted_by: string | null;
  last_contacted_by_name: string | null;
  recovery_notes: string | null;
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

  const recoverCart = async (cartId: string, action: 'send_email' | 'mark_recovered' | 'mark_lost', userName?: string, notes?: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('recover-abandoned-cart', {
        body: { cart_id: cartId, action, user_name: userName, notes },
      });

      if (error) throw error;

      toast({
        title: action === 'send_email' ? '📧 Recovery Email Sent' :
               action === 'mark_recovered' ? '✅ Cart Recovered' : '❌ Cart Marked as Lost',
        description: action === 'send_email'
          ? `Email sent to ${data?.email || 'customer'}. Total emails: ${data?.emails_sent || 1}`
          : `Cart status updated successfully`,
      });

      await fetchCarts();
      return data;
    } catch (error: unknown) {
      console.error('Error recovering cart:', error);
      toast({
        title: 'Error',
        description: `Failed to ${action.replace('_', ' ')}`,
        variant: 'destructive',
      });
      throw error;
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
    contacted: carts.filter(c => c.status === 'contacted').length,
    recovered: carts.filter(c => c.status === 'recovered').length,
    lost: carts.filter(c => c.status === 'lost').length,
    expired: carts.filter(c => c.status === 'expired').length,
    totalValue: carts.filter(c => c.status === 'active' || c.status === 'contacted').reduce((sum, c) => sum + (c.cart_value || 0), 0),
    recoveredValue: carts.filter(c => c.status === 'recovered').reduce((sum, c) => sum + (c.cart_value || 0), 0),
    emailsSent: carts.reduce((sum, c) => sum + (c.recovery_emails_sent || 0), 0),
    conversionRate: carts.length > 0
      ? Math.round((carts.filter(c => c.status === 'recovered').length / carts.length) * 100)
      : 0,
  };

  return { carts, loading, stats, refetch: fetchCarts, recoverCart };
}
