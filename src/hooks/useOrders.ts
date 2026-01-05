import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type OrderStatus = 'pending' | 'confirmed' | 'procuring' | 'in_transit' | 'customs' | 'delivered' | 'cancelled';
export type PaymentStatus = 'pending' | 'partial' | 'full';
export type OrderType = 'prepaid' | 'postpaid';
export type CustomerType = 'b2b' | 'b2c';

export interface Order {
  id: string;
  enquiry_id: string | null;
  product_name: string;
  product_code: string;
  product_category: string;
  quantity: number;
  customer_name: string;
  customer_company: string;
  customer_email: string | null;
  sales_person_id: string;
  sales_person_name: string;
  shipping_address: string | null;
  order_type: OrderType;
  customer_type: CustomerType;
  supplier_name: string | null;
  supplier_contact: string | null;
  procurement_rate: number | null;
  procurement_currency: string;
  selling_price: number | null;
  total_sales_amount: number | null;
  amount_paid: number | null;
  payment_terms: string | null;
  payment_status: PaymentStatus;
  payment_due_date: string | null;
  last_reminder_sent_at: string | null;
  status: OrderStatus;
  tracking_number: string | null;
  tracking_url: string | null;
  committed_timeline: string | null;
  estimated_delivery: string | null;
  actual_delivery: string | null;
  internal_notes: string | null;
  customer_notes: string | null;
  sales_notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface OrderFormData {
  enquiry_id?: string;
  product_name: string;
  product_category: string;
  quantity: number;
  customer_name: string;
  customer_company: string;
  customer_email?: string;
  sales_person_id: string;
  sales_person_name: string;
  shipping_address?: string;
  order_type: OrderType;
  customer_type: CustomerType;
  supplier_id?: string;
  supplier_name?: string;
  supplier_contact?: string;
  procurement_rate?: number;
  procurement_currency?: string;
  selling_price?: number;
  total_sales_amount?: number;
  amount_paid?: number;
  payment_terms?: string;
  payment_status?: PaymentStatus;
  payment_due_date?: string;
  tracking_number?: string;
  tracking_url?: string;
  committed_timeline?: string;
  estimated_delivery?: string;
  internal_notes?: string;
  customer_notes?: string;
  sales_notes?: string;
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

export const PAYMENT_STATUSES: { value: PaymentStatus; label: string }[] = [
  { value: 'pending', label: 'Pending Payment' },
  { value: 'partial', label: 'Partial Received' },
  { value: 'full', label: 'Full Payment Received' },
];

export const ORDER_TYPES: { value: OrderType; label: string }[] = [
  { value: 'prepaid', label: 'Prepaid' },
  { value: 'postpaid', label: 'Postpaid' },
];

export const CUSTOMER_TYPES: { value: CustomerType; label: string }[] = [
  { value: 'b2b', label: 'B2B' },
  { value: 'b2c', label: 'B2C' },
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
            customer_email,
            sales_person_id,
            sales_person_name,
            shipping_address,
            order_type,
            customer_type,
            total_sales_amount,
            amount_paid,
            payment_terms,
            payment_status,
            status,
            tracking_number,
            tracking_url,
            committed_timeline,
            estimated_delivery,
            actual_delivery,
            customer_notes,
            sales_notes,
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
          order_type: (order.order_type || 'prepaid') as OrderType,
          customer_type: (order.customer_type || 'b2b') as CustomerType,
          payment_status: (order.payment_status || 'pending') as PaymentStatus,
          customer_email: order.customer_email || null,
          supplier_name: null,
          supplier_contact: null,
          procurement_rate: null,
          procurement_currency: 'INR',
          selling_price: null,
          internal_notes: null,
          payment_due_date: null,
          last_reminder_sent_at: null,
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
          order_type: (order.order_type || 'prepaid') as OrderType,
          customer_type: (order.customer_type || 'b2b') as CustomerType,
          payment_status: (order.payment_status || 'pending') as PaymentStatus,
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

  const createOrder = async (formData: OrderFormData, paymentFile?: File): Promise<boolean> => {
    if (!user) {
      toast.error('You must be logged in to create orders');
      return false;
    }

    try {
      // Sanitize form data - convert empty strings to null for date and UUID fields
      const sanitizedData = {
        ...formData,
        enquiry_id: formData.enquiry_id || null,
        supplier_id: formData.supplier_id || null,
        sales_person_id: formData.sales_person_id || user.id, // Default to current user if empty
        payment_due_date: formData.payment_due_date || null,
        estimated_delivery: formData.estimated_delivery || null,
        product_code: formData.product_name, // Auto-generate from product name
        created_by: user.id,
        status: 'pending' as const,
      };

      const { data: orderData, error } = await supabase
        .from('orders')
        .insert(sanitizedData)
        .select()
        .single();

      if (error) throw error;

      // If payment file is provided, upload it and create payment record
      if (paymentFile && orderData && formData.amount_paid && formData.amount_paid > 0) {
        try {
          const fileExt = paymentFile.name.split('.').pop();
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
          const filePath = `${user.id}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('payment-screenshots')
            .upload(filePath, paymentFile);

          if (uploadError) {
            console.error('Error uploading payment screenshot:', uploadError);
          } else {
            const { data: { publicUrl } } = supabase.storage
              .from('payment-screenshots')
              .getPublicUrl(filePath);

            await supabase.from('payment_records').insert({
              order_id: orderData.id,
              amount: formData.amount_paid,
              screenshot_url: publicUrl,
              submitted_by: user.id,
              notes: 'Submitted with order creation',
            });
          }
        } catch (uploadErr) {
          console.error('Error processing payment screenshot:', uploadErr);
          // Don't fail the order creation, just log the error
        }
      }

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
