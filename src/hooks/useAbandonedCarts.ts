import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type CartTimeFilter = '24h' | '3d' | '7d' | '30d' | 'all';

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
  priority: string;
  recovered_at: string | null;
  recovered_amount: number | null;
  recovery_source: string | null;
  auto_email_1_sent_at: string | null;
  auto_email_2_sent_at: string | null;
  auto_email_3_sent_at: string | null;
}

export type CartAgeStatus = 'active' | 'at_risk' | 'cold';

export function getCartAgeStatus(createdAt: string): CartAgeStatus {
  const hoursSinceAbandoned = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
  if (hoursSinceAbandoned < 24) return 'active';
  if (hoursSinceAbandoned <= 72) return 'at_risk';
  return 'cold';
}

const FILTER_HOURS: Record<CartTimeFilter, number | null> = {
  '24h': 24,
  '3d': 72,
  '7d': 168,
  '30d': 720,
  'all': null,
};

export function useAbandonedCarts() {
  const [allCarts, setAllCarts] = useState<AbandonedCart[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<CartTimeFilter>('7d');
  const { toast } = useToast();

  const fetchCarts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('abandoned_carts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;
      setAllCarts((data as AbandonedCart[]) || []);
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

  const carts = useMemo(() => {
    const maxHours = FILTER_HOURS[timeFilter];
    if (maxHours === null) return allCarts;
    const cutoff = Date.now() - maxHours * 60 * 60 * 1000;
    return allCarts.filter(c => new Date(c.created_at).getTime() >= cutoff);
  }, [allCarts, timeFilter]);

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

  const stats = useMemo(() => {
    // Stats are computed on the filtered carts
    const activeAge = carts.filter(c => (c.status === 'active' || c.status === 'contacted') && getCartAgeStatus(c.created_at) === 'active');
    const atRiskAge = carts.filter(c => (c.status === 'active' || c.status === 'contacted') && getCartAgeStatus(c.created_at) === 'at_risk');
    const recovered = carts.filter(c => c.status === 'recovered');
    const contacted = carts.filter(c => c.status === 'contacted');

    const activeRevenue = activeAge.reduce((sum, c) => sum + (c.cart_value || 0), 0);
    const atRiskRevenue = atRiskAge.reduce((sum, c) => sum + (c.cart_value || 0), 0);

    return {
      total: carts.length,
      active: activeAge.length,
      atRisk: atRiskAge.length,
      contacted: contacted.length,
      recovered: recovered.length,
      lost: carts.filter(c => c.status === 'lost').length,
      expired: carts.filter(c => c.status === 'expired').length,
      atRiskRevenue: activeRevenue + atRiskRevenue,
      recoveredValue: recovered.reduce((sum, c) => sum + (c.cart_value || 0), 0),
      emailsSent: carts.reduce((sum, c) => sum + (c.recovery_emails_sent || 0), 0),
      conversionRate: carts.length > 0
        ? Math.round((recovered.length / carts.length) * 100)
        : 0,
    };
  }, [carts]);

  return { carts, loading, stats, refetch: fetchCarts, recoverCart, timeFilter, setTimeFilter };
}
