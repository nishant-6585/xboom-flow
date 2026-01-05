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
  notes: string | null;
  created_at: string;
}

export interface OrderItemFormData {
  product_name: string;
  product_code?: string;
  product_category: string;
  quantity: number;
  unit_price?: number;
  procurement_rate?: number;
  notes?: string;
}

export function useOrderItems() {
  const [loading, setLoading] = useState(false);
  const { user, role } = useAuth();

  const fetchOrderItems = useCallback(async (orderId: string): Promise<OrderItem[]> => {
    if (!user) return [];

    try {
      setLoading(true);
      
      // For sales users, hide procurement_rate
      if (role === 'sales') {
        const { data, error } = await supabase
          .from('order_items')
          .select('id, order_id, product_name, product_code, product_category, quantity, unit_price, notes, created_at')
          .eq('order_id', orderId)
          .order('created_at', { ascending: true });

        if (error) throw error;
        
        return (data || []).map(item => ({
          ...item,
          procurement_rate: null,
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
        notes: item.notes || null,
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
