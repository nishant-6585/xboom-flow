import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { SupplierPayment } from './useSuppliers';

export function useInventoryProcurementPayments() {
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchPayments = useCallback(async () => {
    if (!user) {
      setPayments([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('supplier_payments')
        .select('*')
        .not('inventory_procurement_id', 'is', null)
        .order('payment_date', { ascending: false });

      if (error) throw error;

      setPayments((data || []) as SupplierPayment[]);
    } catch (error: any) {
      console.error('Error fetching inventory procurement payments:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const getPaymentsForProcurement = useCallback((procurementId: string) => {
    return payments.filter(p => p.inventory_procurement_id === procurementId);
  }, [payments]);

  const getTotalPaidForProcurement = useCallback((procurementId: string) => {
    return getPaymentsForProcurement(procurementId).reduce((sum, p) => sum + p.amount, 0);
  }, [getPaymentsForProcurement]);

  const getPaymentsByProcurementMap = useCallback(() => {
    const map: Record<string, { payments: SupplierPayment[]; totalPaid: number }> = {};
    
    payments.forEach(payment => {
      if (payment.inventory_procurement_id) {
        if (!map[payment.inventory_procurement_id]) {
          map[payment.inventory_procurement_id] = { payments: [], totalPaid: 0 };
        }
        map[payment.inventory_procurement_id].payments.push(payment);
        map[payment.inventory_procurement_id].totalPaid += payment.amount;
      }
    });
    
    return map;
  }, [payments]);

  return {
    payments,
    loading,
    getPaymentsForProcurement,
    getTotalPaidForProcurement,
    getPaymentsByProcurementMap,
    refetch: fetchPayments,
  };
}
