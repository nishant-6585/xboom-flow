import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ExpenseOrderLink {
  id: string;
  expense_id: string;
  order_id: string;
  created_at: string;
  order?: {
    order_number: string | null;
    product_name: string;
    customer_company: string;
  };
}

export interface ExpenseProcurementLink {
  id: string;
  expense_id: string;
  procurement_id: string;
  created_at: string;
  procurement?: {
    procurement_number: string | null;
    product_name: string;
    supplier_name: string | null;
  };
}

export function useExpenseLinks(expenseId?: string) {
  const [orderLinks, setOrderLinks] = useState<ExpenseOrderLink[]>([]);
  const [procurementLinks, setProcurementLinks] = useState<ExpenseProcurementLink[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLinks = useCallback(async () => {
    if (!expenseId) {
      setOrderLinks([]);
      setProcurementLinks([]);
      return;
    }

    setLoading(true);
    try {
      const [orderLinksResult, procurementLinksResult] = await Promise.all([
        supabase
          .from('expense_order_links')
          .select('*')
          .eq('expense_id', expenseId),
        supabase
          .from('expense_procurement_links')
          .select('*')
          .eq('expense_id', expenseId),
      ]);

      if (orderLinksResult.error) throw orderLinksResult.error;
      if (procurementLinksResult.error) throw procurementLinksResult.error;

      setOrderLinks((orderLinksResult.data as ExpenseOrderLink[]) || []);
      setProcurementLinks((procurementLinksResult.data as ExpenseProcurementLink[]) || []);
    } catch (error: any) {
      console.error('Error fetching expense links:', error);
    } finally {
      setLoading(false);
    }
  }, [expenseId]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  return {
    orderLinks,
    procurementLinks,
    loading,
    refetch: fetchLinks,
  };
}

export function useAllExpenseLinks() {
  const [allOrderLinks, setAllOrderLinks] = useState<ExpenseOrderLink[]>([]);
  const [allProcurementLinks, setAllProcurementLinks] = useState<ExpenseProcurementLink[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAllLinks = useCallback(async () => {
    try {
      const [orderLinksResult, procurementLinksResult] = await Promise.all([
        supabase.from('expense_order_links').select('*'),
        supabase.from('expense_procurement_links').select('*'),
      ]);

      if (orderLinksResult.error) throw orderLinksResult.error;
      if (procurementLinksResult.error) throw procurementLinksResult.error;

      setAllOrderLinks((orderLinksResult.data as ExpenseOrderLink[]) || []);
      setAllProcurementLinks((procurementLinksResult.data as ExpenseProcurementLink[]) || []);
    } catch (error: any) {
      console.error('Error fetching all expense links:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllLinks();
  }, [fetchAllLinks]);

  const linkOrdersToExpense = async (expenseId: string, orderIds: string[]) => {
    try {
      // Remove existing links first
      await supabase
        .from('expense_order_links')
        .delete()
        .eq('expense_id', expenseId);

      if (orderIds.length > 0) {
        const { error } = await supabase
          .from('expense_order_links')
          .insert(orderIds.map(orderId => ({ expense_id: expenseId, order_id: orderId })));

        if (error) throw error;
      }

      fetchAllLinks();
      return true;
    } catch (error: any) {
      console.error('Error linking orders to expense:', error);
      toast.error('Failed to link orders');
      return false;
    }
  };

  const linkProcurementsToExpense = async (expenseId: string, procurementIds: string[]) => {
    try {
      // Remove existing links first
      await supabase
        .from('expense_procurement_links')
        .delete()
        .eq('expense_id', expenseId);

      if (procurementIds.length > 0) {
        const { error } = await supabase
          .from('expense_procurement_links')
          .insert(procurementIds.map(procurementId => ({ expense_id: expenseId, procurement_id: procurementId })));

        if (error) throw error;
      }

      fetchAllLinks();
      return true;
    } catch (error: any) {
      console.error('Error linking procurements to expense:', error);
      toast.error('Failed to link procurements');
      return false;
    }
  };

  const getLinkedOrdersForExpense = (expenseId: string) => {
    return allOrderLinks.filter(link => link.expense_id === expenseId).map(link => link.order_id);
  };

  const getLinkedProcurementsForExpense = (expenseId: string) => {
    return allProcurementLinks.filter(link => link.expense_id === expenseId).map(link => link.procurement_id);
  };

  const getExpensesForOrder = (orderId: string) => {
    return allOrderLinks.filter(link => link.order_id === orderId).map(link => link.expense_id);
  };

  const getExpensesForProcurement = (procurementId: string) => {
    return allProcurementLinks.filter(link => link.procurement_id === procurementId).map(link => link.expense_id);
  };

  return {
    allOrderLinks,
    allProcurementLinks,
    loading,
    linkOrdersToExpense,
    linkProcurementsToExpense,
    getLinkedOrdersForExpense,
    getLinkedProcurementsForExpense,
    getExpensesForOrder,
    getExpensesForProcurement,
    refetch: fetchAllLinks,
  };
}
