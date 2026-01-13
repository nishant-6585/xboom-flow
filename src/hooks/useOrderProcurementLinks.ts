import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from './useAuth';

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
  const [links, setLinks] = useState<OrderProcurementLinkWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, role } = useAuth();

  const fetchLinks = useCallback(async () => {
    if (!user) {
      setLinks([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Fetch links with order and procurement details
      const { data: linksData, error: linksError } = await supabase
        .from('order_procurement_links')
        .select('*')
        .order('linked_at', { ascending: false });

      if (linksError) throw linksError;

      // Fetch related orders and procurements
      const orderIds = [...new Set((linksData || []).map(l => l.order_id))];
      const procurementIds = [...new Set((linksData || []).map(l => l.inventory_procurement_id))];

      const [ordersRes, procurementsRes] = await Promise.all([
        orderIds.length > 0 
          ? supabase.from('orders').select('id, order_number, product_name, customer_company, total_sales_amount, amount_paid, payment_status').in('id', orderIds)
          : { data: [], error: null },
        procurementIds.length > 0 
          ? supabase.from('inventory_procurements').select('id, procurement_number, product_name, supplier_name, total_amount, payment_status').in('id', procurementIds)
          : { data: [], error: null },
      ]);

      const ordersMap = new Map((ordersRes.data || []).map(o => [o.id, o]));
      const procurementsMap = new Map((procurementsRes.data || []).map(p => [p.id, p]));

      const enrichedLinks: OrderProcurementLinkWithDetails[] = (linksData || []).map(link => ({
        ...link,
        order: ordersMap.get(link.order_id),
        procurement: procurementsMap.get(link.inventory_procurement_id),
      }));

      setLinks(enrichedLinks);
    } catch (error: any) {
      console.error('Error fetching order procurement links:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const createLink = async (
    orderId: string,
    procurementId: string,
    quantityUsed: number,
    orderItemId?: string,
    notes?: string
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('order_procurement_links')
        .insert({
          order_id: orderId,
          order_item_id: orderItemId || null,
          inventory_procurement_id: procurementId,
          quantity_used: quantityUsed,
          linked_by: user?.id,
          notes: notes || null,
        });

      if (error) throw error;

      toast.success('Procurement linked to order successfully');
      fetchLinks();
      return true;
    } catch (error: any) {
      console.error('Error creating link:', error);
      toast.error('Failed to link procurement to order');
      return false;
    }
  };

  const deleteLink = async (linkId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('order_procurement_links')
        .delete()
        .eq('id', linkId);

      if (error) throw error;

      toast.success('Link removed successfully');
      fetchLinks();
      return true;
    } catch (error: any) {
      console.error('Error deleting link:', error);
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
    loading,
    createLink,
    deleteLink,
    getLinksForOrder,
    getLinksForProcurement,
    refetch: fetchLinks,
  };
}
