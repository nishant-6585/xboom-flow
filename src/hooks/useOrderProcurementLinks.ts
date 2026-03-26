import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from './useAuth';

export interface ProcurementWithOrder {
  id: string;
  procurement_number: string | null;
  product_name: string;
  product_category: string;
  quantity: number;
  unit_price: number | null;
  total_amount: number | null;
  supplier_id: string | null;
  supplier_name: string | null;
  payment_status: string;
  procurement_date: string;
  order_id: string;
  created_by: string | null;
  notes: string | null;
  created_at: string;
  order?: {
    id: string;
    order_number: string | null;
    product_name: string;
    customer_company: string;
    total_sales_amount: number | null;
    amount_paid: number | null;
    payment_status: string | null;
  };
}

// Keep old interface for backward compatibility
export interface OrderProcurementLink {
  id: string;
  order_id: string;
  order_item_id: string | null;
  inventory_procurement_id: string;
  quantity_used: number;
  linked_at: string;
  linked_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface OrderProcurementLinkWithDetails extends OrderProcurementLink {
  order?: {
    order_number: string | null;
    product_name: string;
    customer_company: string;
    total_sales_amount: number | null;
    amount_paid: number | null;
    payment_status: string | null;
  };
  procurement?: {
    procurement_number: string | null;
    product_name: string;
    supplier_name: string | null;
    total_amount: number | null;
    payment_status: string;
  };
}

export function useOrderProcurementLinks() {
  const { user, role } = useAuth();

  const fetchData = useCallback(async (): Promise<{ procurementsWithOrders: ProcurementWithOrder[]; links: OrderProcurementLinkWithDetails[] }> => {
    if (!user) {
      return { procurementsWithOrders: [], links: [] };
    }

    try {
      // Fetch procurements that have order_id set (the main data source now)
      const { data: procurementsData, error: procurementsError } = await supabase
        .from('inventory_procurements')
        .select('*')
        .not('order_id', 'is', null)
        .order('procurement_date', { ascending: false });

      if (procurementsError) throw procurementsError;

      // Get unique order IDs
      const orderIds = [...new Set((procurementsData || []).map(p => p.order_id).filter(Boolean))];

      // Fetch related orders
      const { data: ordersData, error: ordersError } = orderIds.length > 0
        ? await supabase
            .from('orders')
            .select('id, order_number, product_name, customer_company, total_sales_amount, amount_paid, payment_status')
            .in('id', orderIds)
        : { data: [], error: null };

      if (ordersError) throw ordersError;

      const ordersMap = new Map((ordersData || []).map(o => [o.id, o]));

      // Enrich procurements with order details
      const enrichedProcurements: ProcurementWithOrder[] = (procurementsData || []).map(proc => ({
        ...proc,
        order: ordersMap.get(proc.order_id),
      }));

      // Also create backward-compatible links format
      const backwardCompatibleLinks: OrderProcurementLinkWithDetails[] = enrichedProcurements.map(proc => ({
        id: proc.id,
        order_id: proc.order_id,
        order_item_id: null,
        inventory_procurement_id: proc.id,
        quantity_used: proc.quantity,
        linked_at: proc.procurement_date,
        linked_by: proc.created_by,
        notes: proc.notes,
        created_at: proc.created_at,
        order: proc.order,
        procurement: {
          procurement_number: proc.procurement_number,
          product_name: proc.product_name,
          supplier_name: proc.supplier_name,
          total_amount: proc.total_amount,
          payment_status: proc.payment_status,
        },
      }));

      return { procurementsWithOrders: enrichedProcurements, links: backwardCompatibleLinks };
    } catch (error: any) {
      console.error('Error fetching procurement-order data:', error);
      return { procurementsWithOrders: [], links: [] };
    }
  }, [user]);

  const linksQuery = useQuery({
    queryKey: ['order-procurement-links', user?.id, role],
    queryFn: fetchData,
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const procurementsWithOrders = linksQuery.data?.procurementsWithOrders ?? [];
  const links = linksQuery.data?.links ?? [];
  const loading = linksQuery.isLoading;
  const refetch = useCallback(() => linksQuery.refetch(), [linksQuery]);

  // These functions are kept for backward compatibility but may not be used
  const createLink = async (
    orderId: string,
    procurementId: string,
    quantityUsed: number,
    orderItemId?: string,
    notes?: string
  ): Promise<boolean> => {
    try {
      // Instead of creating a separate link, update the procurement's order_id
      const { error } = await supabase
        .from('inventory_procurements')
        .update({ order_id: orderId })
        .eq('id', procurementId);

      if (error) throw error;

      toast.success('Procurement linked to order successfully');
      await refetch();
      return true;
    } catch (error: any) {
      console.error('Error linking procurement:', error);
      toast.error('Failed to link procurement to order');
      return false;
    }
  };

  const deleteLink = async (procurementId: string): Promise<boolean> => {
    try {
      // Remove the order_id from the procurement
      const { error } = await supabase
        .from('inventory_procurements')
        .update({ order_id: null })
        .eq('id', procurementId);

      if (error) throw error;

      toast.success('Link removed successfully');
      await refetch();
      return true;
    } catch (error: any) {
      console.error('Error unlinking procurement:', error);
      toast.error('Failed to remove link');
      return false;
    }
  };

  const getLinksForOrder = useCallback((orderId: string) => {
    return links.filter(l => l.order_id === orderId);
  }, [links]);

  const getLinksForProcurement = useCallback((procurementId: string) => {
    return links.filter(l => l.inventory_procurement_id === procurementId);
  }, [links]);

  return {
    links,
    procurementsWithOrders,
    loading,
    createLink,
    deleteLink,
    getLinksForOrder,
    getLinksForProcurement,
    refetch,
  };
}
