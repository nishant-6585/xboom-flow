import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type OrderStatus = 'pending' | 'confirmed' | 'procuring' | 'in_transit' | 'customs' | 'delivered' | 'cancelled';

export interface Order {
  id: string;
  enquiry_id: string | null;
  product_name: string;
  product_code: string;
  product_category: string;
  quantity: number;
  customer_name: string;
  customer_company: string;
  sales_person_id: string;
  sales_person_name: string;
  supplier_name: string | null;
  supplier_contact: string | null;
  procurement_rate: number | null;
  procurement_currency: string;
  selling_price: number | null;
  status: OrderStatus;
  tracking_number: string | null;
  tracking_url: string | null;
  committed_timeline: string | null;
  estimated_delivery: string | null;
  actual_delivery: string | null;
  internal_notes: string | null;
  customer_notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface OrderFormData {
  enquiry_id?: string;
  product_name: string;
  product_code: string;
  product_category: string;
  quantity: number;
  customer_name: string;
  customer_company: string;
  sales_person_id: string;
  sales_person_name: string;
  supplier_name?: string;
  supplier_contact?: string;
  procurement_rate?: number;
  procurement_currency?: string;
  selling_price?: number;
  tracking_number?: string;
  tracking_url?: string;
  committed_timeline?: string;
  estimated_delivery?: string;
  internal_notes?: string;
  customer_notes?: string;
}

export const ORDER_STATUSES: { value: OrderStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'procuring', label: 'Procuring' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'customs', label: 'Customs' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, role } = useAuth();

  const fetchOrders = useCallback(async () => {
    if (!user) {
      setOrders([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // For sales users, we only fetch limited columns (procurement details are hidden)
      if (role === 'sales') {
        const { data, error } = await supabase
          .from('orders')
          .select(`
            id,
            enquiry_id,
            product_name,
            product_code,
            product_category,
            quantity,
            customer_name,
            customer_company,
            sales_person_id,
            sales_person_name,
            status,
            tracking_number,
            tracking_url,
            committed_timeline,
            estimated_delivery,
            actual_delivery,
            customer_notes,
            created_at,
            updated_at,
            created_by
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        // Map to Order type with null procurement fields
        const mappedOrders: Order[] = (data || []).map(order => ({
          ...order,
          status: order.status as OrderStatus,
          supplier_name: null,
          supplier_contact: null,
          procurement_rate: null,
          procurement_currency: 'INR',
          selling_price: null,
          internal_notes: null,
        }));
        
        setOrders(mappedOrders);
      } else {
        // Supply chain and admin get all fields
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        const mappedOrders: Order[] = (data || []).map(order => ({
          ...order,
          status: order.status as OrderStatus,
        }));
        
        setOrders(mappedOrders);
      }
    } catch (error: any) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  }, [user, role]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Set up realtime subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('orders-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchOrders]);

  const createOrder = async (formData: OrderFormData): Promise<boolean> => {
    if (!user) {
      toast.error('You must be logged in to create orders');
      return false;
    }

    try {
      const { error } = await supabase
        .from('orders')
        .insert({
          ...formData,
          created_by: user.id,
          status: 'pending',
        });

      if (error) throw error;

      toast.success('Order created successfully');
      return true;
    } catch (error: any) {
      console.error('Error creating order:', error);
      toast.error(error.message || 'Failed to create order');
      return false;
    }
  };

  const updateOrder = async (
    orderId: string,
    updates: Partial<Order>
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', orderId);

      if (error) throw error;

      toast.success('Order updated successfully');
      return true;
    } catch (error: any) {
      console.error('Error updating order:', error);
      toast.error(error.message || 'Failed to update order');
      return false;
    }
  };

  const deleteOrder = async (orderId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;

      toast.success('Order deleted successfully');
      return true;
    } catch (error: any) {
      console.error('Error deleting order:', error);
      toast.error(error.message || 'Failed to delete order');
      return false;
    }
  };

  return {
    orders,
    loading,
    createOrder,
    updateOrder,
    deleteOrder,
    refetch: fetchOrders,
  };
}
