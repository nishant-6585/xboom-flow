import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface OrderItem {
  id: string;
  order_id: string;
  product_name: string;
  product_code: string | null;
  product_category: string;
  quantity: number;
  unit_price: number | null;
  procurement_rate: number | null;
  procurement_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  sales_gst_percent: number | null;
  sales_gst_amount: number | null;
  procurement_gst_percent: number | null;
  procurement_gst_amount: number | null;
  sales_price_includes_gst: boolean | null;
  procurement_price_includes_gst: boolean | null;
  discount_amount: number | null;
}

export type OrderItemStatus = 'pending' | 'ordered' | 'in_transit' | 'received' | 'cancelled';

export const ORDER_ITEM_STATUSES: { value: OrderItemStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
];

export interface OrderItemFormData {
  product_name: string;
  product_code?: string;
  product_category: string;
  quantity: number;
  unit_price?: number;
  procurement_rate?: number;
  procurement_date?: string;
  supplier_id?: string;
  status?: string;
  notes?: string;
  sales_gst_percent?: number;
  sales_gst_amount?: number;
  procurement_gst_percent?: number;
  procurement_gst_amount?: number;
  sales_price_includes_gst?: boolean;
  procurement_price_includes_gst?: boolean;
  discount_amount?: number;
}

export function useOrderItems() {
  const [loading, setLoading] = useState(false);
  const { user, role } = useAuth();

  const fetchOrderItems = useCallback(async (orderId: string): Promise<OrderItem[]> => {
    if (!user) return [];

    try {
      setLoading(true);
      
      // For sales users, hide procurement_rate and procurement_date
      if (role === 'sales') {
        const { data, error } = await supabase
          .from('order_items')
          .select('id, order_id, product_name, product_code, product_category, quantity, unit_price, notes, created_at, status, sales_gst_percent, sales_gst_amount, sales_price_includes_gst, discount_amount')
          .eq('order_id', orderId)
          .order('created_at', { ascending: true });

        if (error) throw error;
        
        return (data || []).map(item => ({
          ...item,
          procurement_rate: null,
          procurement_date: null,
          procurement_gst_percent: null,
          procurement_gst_amount: null,
          procurement_price_includes_gst: null,
        }));
      } else {
        const { data, error } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', orderId)
          .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
      }
    } catch (error: any) {
      console.error('Error fetching order items:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, [user, role]);

  const createOrderItems = async (orderId: string, items: OrderItemFormData[]): Promise<boolean> => {
    if (!user || items.length === 0) return true;

    try {
      const itemsToInsert = items.map(item => ({
        order_id: orderId,
        product_name: item.product_name,
        product_code: item.product_code || item.product_name,
        product_category: item.product_category,
        quantity: item.quantity,
        unit_price: item.unit_price || null,
        procurement_rate: item.procurement_rate || null,
        procurement_date: item.procurement_date || null,
        supplier_id: item.supplier_id || null,
        notes: item.notes || null,
        sales_gst_percent: item.sales_gst_percent || 0,
        sales_gst_amount: item.sales_gst_amount || 0,
        procurement_gst_percent: item.procurement_gst_percent || 0,
        procurement_gst_amount: item.procurement_gst_amount || 0,
        sales_price_includes_gst: item.sales_price_includes_gst || false,
        procurement_price_includes_gst: item.procurement_price_includes_gst || false,
        discount_amount: item.discount_amount || 0,
      }));

      const { error } = await supabase
        .from('order_items')
        .insert(itemsToInsert);

      if (error) throw error;
      return true;
    } catch (error: any) {
      console.error('Error creating order items:', error);
      toast.error('Failed to add order items');
      return false;
    }
  };

  const updateOrderItem = async (itemId: string, updates: Partial<OrderItemFormData>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('order_items')
        .update(updates)
        .eq('id', itemId);

      if (error) throw error;
      return true;
    } catch (error: any) {
      console.error('Error updating order item:', error);
      toast.error('Failed to update item');
      return false;
    }
  };

  const deleteOrderItem = async (itemId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('order_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
      return true;
    } catch (error: any) {
      console.error('Error deleting order item:', error);
      toast.error('Failed to delete item');
      return false;
    }
  };

  return {
    loading,
    fetchOrderItems,
    createOrderItems,
    updateOrderItem,
    deleteOrderItem,
  };
}
