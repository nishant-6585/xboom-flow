import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface MissingPhoneOrder {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_company: string | null;
  customer_email: string | null;
  status: string;
  order_date: string | null;
  created_at: string;
  sales_person_id: string | null;
  sales_person_name: string | null;
  total_sales_amount: number | null;
}

const PRIVILEGED_ROLES = new Set(['Admin', 'Finance', 'Operations']);

export function useOrdersMissingPhone() {
  const { user, role } = useAuth();
  const [orders, setOrders] = useState<MissingPhoneOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    if (!user) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let query = (supabase as any)
      .from('orders_missing_phone')
      .select('*')
      .order('created_at', { ascending: true });

    // Sales-type roles only see their own missing-phone orders
    if (!role || !PRIVILEGED_ROLES.has(role)) {
      query = query.eq('sales_person_id', user.id);
    }

    const { data, error } = await query;
    if (error) {
      console.error('useOrdersMissingPhone error:', error);
      setOrders([]);
    } else {
      setOrders((data as MissingPhoneOrder[]) || []);
    }
    setLoading(false);
  }, [user, role]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return { orders, loading, refetch: fetchOrders };
}