import { useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { sendSlackNotification } from '@/hooks/useSlackSettings';
import { mapOrderUpdateError } from '@/lib/orderPhone';

export type OrderStatus = 'po_received' | 'payment_received' | 'partial_payment_received' | 'procurement_to_plan' | 'procurement_in_process' | 'procurement_done' | 'to_ship' | 'in_transit' | 'delivery_done' | 'cancelled';
export type PaymentStatus = 'pending' | 'partial' | 'full';
export type OrderType = 'prepaid' | 'postpaid';
export type CustomerType = 'b2b' | 'b2c';
export type RefundStatus = 'pending' | 'approved' | 'done';
export type OrderOutcome = 'pending' | 'won' | 'lost';
export type LostReason = 'price' | 'timeline' | 'competitor' | 'no_response' | 'requirements_changed' | 'other';

export type LeadSource = 'call' | 'chat' | 'email' | 'event' | 'walk-in' | 'referral' | 'repeated' | 'abandon_cart' | 'myoperator' | 'interakt' | 'google_ads' | 'indiamart' | 'website_form' | 'exhibition' | 'social_media' | 'q_form';

export interface Order {
  id: string;
  order_number: string | null;
  enquiry_id: string | null;
  product_name: string;
  product_code: string;
  product_category: string;
  quantity: number;
  customer_name: string;
  customer_company: string;
  customer_email: string | null;
  customer_gst: string | null;
  customer_phone: string | null;
  sales_person_id: string;
  sales_person_name: string;
  shipping_address: string | null;
  order_type: OrderType;
  customer_type: CustomerType;
  lead_source: LeadSource | null;
  supplier_id: string | null;
  supplier_name: string | null;
  supplier_contact: string | null;
  procurement_rate: number | null;
  procurement_currency: string;
  procurement_date: string | null;
  selling_price: number | null;
  total_sales_amount: number | null;
  discount_amount: number | null;
  amount_paid: number | null;
  payment_terms: string | null;
  payment_status: PaymentStatus;
  payment_due_date: string | null;
  last_reminder_sent_at: string | null;
  status: OrderStatus;
  tracking_number: string | null;
  tracking_url: string | null;
  courier_name?: string | null;
  committed_timeline: string | null;
  estimated_delivery: string | null;
  actual_delivery: string | null;
  internal_notes: string | null;
  customer_notes: string | null;
  sales_notes: string | null;
  invoice_url: string | null;
  invoice_number: string | null;
  po_url: string | null;
  po_number: string | null;
  order_date: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  is_refund_requested: boolean;
  refund_reason: string | null;
  refund_status: RefundStatus | null;
  refund_requested_at: string | null;
  refund_requested_by: string | null;
  priority: number;
  is_escalated: boolean;
  escalated_at: string | null;
  escalated_by: string | null;
  escalation_reason: string | null;
  delivery_charges: number | null;
  order_outcome: OrderOutcome;
  lost_reason: LostReason | null;
  lost_reason_notes: string | null;
  outcome_updated_at: string | null;
  outcome_updated_by: string | null;
  supplier_payment_terms: string | null;
  supplier_payment_due_date: string | null;
  // RTO and cancellation fields
  is_rto: boolean;
  rto_marked_at: string | null;
  rto_marked_by: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  /** Order origin: 'manual' (default) or 'website' (WooCommerce). Used by analytics filters. */
  source?: string | null;
  external_id?: string | null;
}

export interface OrderFormData {
  enquiry_id?: string;
  product_name: string;
  product_category: string;
  quantity: number;
  customer_name: string;
  customer_company: string;
  customer_email?: string;
  customer_gst?: string;
  customer_phone?: string;
  sales_person_id?: string;
  sales_person_name?: string;
  is_website_order?: boolean;
  shipping_address?: string;
  order_type: OrderType;
  customer_type: CustomerType;
  lead_source?: LeadSource;
  supplier_id?: string;
  supplier_name?: string;
  supplier_contact?: string;
  procurement_rate?: number;
  procurement_currency?: string;
  selling_price?: number;
  total_sales_amount?: number;
  discount_amount?: number;
  amount_paid?: number;
  payment_terms?: string;
  payment_status?: PaymentStatus;
  payment_due_date?: string;
  tracking_number?: string;
  tracking_url?: string;
  courier_name?: string;
  committed_timeline?: string;
  estimated_delivery?: string;
  internal_notes?: string;
  customer_notes?: string;
  sales_notes?: string;
  invoice_url?: string;
  po_url?: string;
  delivery_charges?: number;
}

export const ORDER_STATUSES: { value: OrderStatus; label: string }[] = [
  { value: 'po_received', label: 'PO Received' },
  { value: 'payment_received', label: 'Payment Received' },
  { value: 'partial_payment_received', label: 'Partial Payment Received' },
  { value: 'procurement_to_plan', label: 'Procurement to Plan' },
  { value: 'procurement_in_process', label: 'Procurement in Process' },
  { value: 'procurement_done', label: 'Procurement Done' },
  { value: 'to_ship', label: 'To Ship' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'delivery_done', label: 'Delivery Done' },
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

export const LEAD_SOURCES: { value: LeadSource; label: string }[] = [
  { value: 'abandon_cart', label: 'Abandon Cart' },
  { value: 'call', label: 'Call' },
  { value: 'chat', label: 'Chat' },
  { value: 'email', label: 'Email' },
  { value: 'event', label: 'Event' },
  { value: 'exhibition', label: 'Exhibition' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'indiamart', label: 'IndiaMART' },
  { value: 'interakt', label: 'Interakt' },
  { value: 'myoperator', label: 'MyOperator' },
  { value: 'q_form', label: 'Q-Form' },
  { value: 'referral', label: 'Referral' },
  { value: 'repeated', label: 'Repeated Customer' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'walk-in', label: 'Walk-in' },
  { value: 'website_form', label: 'Website Form' },
];

export const REFUND_STATUSES: { value: RefundStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'done', label: 'Done' },
];

export const ORDER_OUTCOMES: { value: OrderOutcome; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

export const LOST_REASONS: { value: LostReason; label: string }[] = [
  { value: 'price', label: 'Price too high' },
  { value: 'timeline', label: 'Timeline not met' },
  { value: 'competitor', label: 'Lost to competitor' },
  { value: 'no_response', label: 'No response from customer' },
  { value: 'requirements_changed', label: 'Requirements changed' },
  { value: 'other', label: 'Other' },
];

export const ORDER_PRIORITIES: { value: number; label: string; color: string }[] = [
  { value: 1, label: 'Priority 1 (Urgent)', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  { value: 2, label: 'Priority 2 (High)', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  { value: 3, label: 'Priority 3 (Normal)', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  { value: 4, label: 'Priority 4 (Low)', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' },
];

export function useOrders() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();

  const fetchOrders = useCallback(async (): Promise<Order[]> => {
    if (!user) {
      return [];
    }

    try {
      // For sales users, we only fetch limited columns (procurement details are hidden)
      if (role === 'sales') {
        const { data, error } = await supabase
          .from('orders')
          .select(`
            id,
            enquiry_id,
            order_number,
            product_name,
            product_code,
            product_category,
            quantity,
            customer_name,
            customer_company,
            customer_email,
            customer_gst,
            customer_phone,
            sales_person_id,
            sales_person_name,
            shipping_address,
            order_type,
            customer_type,
            total_sales_amount,
            discount_amount,
            amount_paid,
            payment_terms,
            payment_status,
            status,
            tracking_number,
            tracking_url,
            courier_name,
            committed_timeline,
            estimated_delivery,
            actual_delivery,
            customer_notes,
            sales_notes,
            created_at,
            updated_at,
            created_by,
            priority,
            is_escalated,
            escalated_at,
            escalated_by,
            escalation_reason,
            order_date,
            source,
            external_id,
            deleted_at
          `)
          .order('created_at', { ascending: false })
          .limit(5000);

        if (error) throw error;
        
        // Map to Order type with null procurement fields
        const mappedOrders: Order[] = (data || []).map(order => ({
          ...order,
          order_number: order.order_number || null,
          status: order.status as OrderStatus,
          order_type: (order.order_type || 'prepaid') as OrderType,
          customer_type: (order.customer_type || 'b2b') as CustomerType,
          payment_status: (order.payment_status || 'pending') as PaymentStatus,
          lead_source: null,
          customer_email: order.customer_email || null,
          customer_gst: (order as any).customer_gst || null,
          customer_phone: (order as any).customer_phone || null,
          supplier_id: null,
          supplier_name: null,
          supplier_contact: null,
          procurement_rate: null,
          procurement_currency: 'INR',
          procurement_date: null,
          selling_price: null,
          internal_notes: null,
          payment_due_date: null,
          last_reminder_sent_at: null,
          invoice_url: null,
          invoice_number: null,
          po_url: null,
          po_number: null,
          order_date: (order as any).order_date || null,
          is_refund_requested: false,
          refund_reason: null,
          refund_status: null,
          refund_requested_at: null,
          refund_requested_by: null,
          priority: order.priority || 3,
          is_escalated: order.is_escalated || false,
          escalated_at: order.escalated_at || null,
          escalated_by: order.escalated_by || null,
          escalation_reason: order.escalation_reason || null,
          discount_amount: (order as any).discount_amount || null,
          delivery_charges: null,
          order_outcome: 'pending' as OrderOutcome,
          lost_reason: null,
          lost_reason_notes: null,
          outcome_updated_at: null,
          outcome_updated_by: null,
          supplier_payment_terms: null,
          supplier_payment_due_date: null,
          is_rto: false,
          rto_marked_at: null,
          rto_marked_by: null,
          cancellation_reason: null,
          cancelled_at: null,
          cancelled_by: null,
        }));
        
        return mappedOrders;
      } else {
        // Supply chain and admin get all fields
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5000);

        if (error) throw error;
        
        const mappedOrders: Order[] = (data || []).map(order => ({
          ...order,
          status: order.status as OrderStatus,
          order_type: (order.order_type || 'prepaid') as OrderType,
          customer_type: (order.customer_type || 'b2b') as CustomerType,
          payment_status: (order.payment_status || 'pending') as PaymentStatus,
          order_outcome: (order.order_outcome || 'pending') as OrderOutcome,
          lost_reason: (order.lost_reason || null) as LostReason | null,
          lead_source: (order.lead_source || null) as LeadSource | null,
          refund_status: (order.refund_status || null) as RefundStatus | null,
          discount_amount: order.discount_amount || null,
          invoice_number: (order as any).invoice_number || null,
          is_rto: order.is_rto || false,
          rto_marked_at: order.rto_marked_at || null,
          rto_marked_by: order.rto_marked_by || null,
          cancellation_reason: order.cancellation_reason || null,
          cancelled_at: order.cancelled_at || null,
          cancelled_by: order.cancelled_by || null,
        }));
        
        return mappedOrders;
      }
    } catch (error: any) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to fetch orders');
      return [];
    }
  }, [user, role]);

  const ordersQuery = useQuery({
    queryKey: ['orders', user?.id, role],
    queryFn: fetchOrders,
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    // Always refetch on mount when cached data is empty so a transient
    // failure (or stale empty cache) does not leave the UI showing
    // "No orders found" indefinitely.
    refetchOnMount: (query) => {
      const data = query.state.data as unknown[] | undefined;
      return !data || data.length === 0 ? 'always' : false;
    },
  });

  // Safety net: hide website-sourced orders dated before the cutover window
  // (mirroring only started 2026-04-30). Prevents accidental backfill of old
  // WooCommerce data from polluting the Orders tab UI.
  const WEBSITE_ORDER_CUTOFF = new Date('2026-04-30T00:00:00Z').getTime();
  const rawOrders = ordersQuery.data ?? [];
  const orders = rawOrders.filter((o: any) => {
    if (o?.deleted_at) return false;
    if ((o?.source || 'manual') !== 'website') return true;
    // Website orders: hide pending-payment (po_received) and cancelled rows
    // from the main Orders list. These live in dedicated tabs:
    //   - po_received -> Orders > Website Pending Payment tab
    //   - cancelled  -> Sales > Leads > Website abandoned carts
    const status = (o?.status || '').toLowerCase();
    if (status === 'po_received' || status === 'cancelled') return false;
    const refDate = o.order_date || o.created_at;
    if (!refDate) return false;
    return new Date(refDate).getTime() >= WEBSITE_ORDER_CUTOFF;
  });
  const loading = ordersQuery.isLoading;
  const refetch = useCallback(() => ordersQuery.refetch(), [ordersQuery]);

  // Set up realtime subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('orders-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['orders', user?.id, role] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, role, queryClient]);

  const createOrder = async (
    formData: OrderFormData, 
    paymentFiles?: File[], 
    orderItems?: { product_name: string; product_code?: string; product_category: string; quantity: number; unit_price?: number; procurement_rate?: number; notes?: string; }[],
    invoiceFile?: File,
    poFiles?: File[]
  ): Promise<boolean> => {
    if (!user) {
      toast.error('You must be logged in to create orders');
      return false;
    }

    try {
      const { validateFile } = await import('@/lib/fileValidation');
      // Upload invoice file if provided
      let invoiceUrl = formData.invoice_url;
      if (invoiceFile) {
        const invValidation = validateFile(invoiceFile, 'invoices');
        if (!invValidation.valid) { toast.error(invValidation.error); return false; }
        const fileExt = invoiceFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('invoices')
          .upload(filePath, invoiceFile);

        if (uploadError) {
          console.error('Error uploading invoice:', uploadError);
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from('invoices')
            .getPublicUrl(filePath);
          invoiceUrl = publicUrl;
        }
      }

      // Upload PO files if provided (multiple)
      let poUrl = formData.po_url;
      if (poFiles && poFiles.length > 0) {
        const uploadedPoUrls: string[] = [];
        for (const poFile of poFiles) {
          const poValidation = validateFile(poFile, 'documents');
          if (!poValidation.valid) { console.error('Skipping invalid PO:', poValidation.error); continue; }
          const fileExt = poFile.name.split('.').pop();
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
          const filePath = `${user.id}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('purchase-orders')
            .upload(filePath, poFile);

          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage
              .from('purchase-orders')
              .getPublicUrl(filePath);
            uploadedPoUrls.push(publicUrl);
          } else {
            console.error('Error uploading PO:', uploadError);
          }
        }
        if (uploadedPoUrls.length > 0) {
          poUrl = uploadedPoUrls.join(',');
        }
      }

      // Sanitize form data - convert empty strings to null for date and UUID fields
      // For website orders, use 'Website Order' as placeholder
      const salesPersonId = formData.sales_person_id || user.id;
      const salesPersonName = formData.sales_person_name || 'Website Order';
      
      const sanitizedData = {
        ...formData,
        enquiry_id: formData.enquiry_id || null,
        supplier_id: formData.supplier_id || null,
        sales_person_id: salesPersonId,
        sales_person_name: salesPersonName,
        payment_due_date: formData.payment_due_date || null,
        estimated_delivery: formData.estimated_delivery || null,
        product_code: formData.product_name, // Auto-generate from product name
        created_by: user.id,
        status: 'po_received' as const,
        invoice_url: invoiceUrl || null,
        po_url: poUrl || null,
      };
      
      // Remove is_website_order from the data as it's not a database field
      delete (sanitizedData as any).is_website_order;

      const { data: orderData, error } = await supabase
        .from('orders')
        .insert(sanitizedData)
        .select()
        .single();

      if (error) throw error;

      // Insert order items if provided
      if (orderData && orderItems && orderItems.length > 0) {
        const itemsToInsert = orderItems.map(item => ({
          order_id: orderData.id,
          product_name: item.product_name,
          product_code: item.product_code || item.product_name,
          product_category: item.product_category,
          quantity: item.quantity,
          unit_price: item.unit_price || null,
          // Flow procurement fields from order to items
          procurement_rate: item.procurement_rate || formData.procurement_rate || null,
          supplier_id: formData.supplier_id || null,
          notes: item.notes || null,
        }));

        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(itemsToInsert);

        if (itemsError) {
          console.error('Error creating order items:', itemsError);
          // Don't fail the order creation, just log the error
        }
      }

      // If payment files are provided, upload them and create payment records
      if (paymentFiles && paymentFiles.length > 0 && orderData && formData.amount_paid && formData.amount_paid > 0) {
        try {
          const uploadedPaymentUrls: string[] = [];
          for (const paymentFile of paymentFiles) {
            const payValidation = validateFile(paymentFile, 'screenshots');
            if (!payValidation.valid) { console.error('Skipping invalid payment file:', payValidation.error); continue; }
            const fileExt = paymentFile.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `${user.id}/${fileName}`;

            const { error: uploadError } = await supabase.storage
              .from('payment-screenshots')
              .upload(filePath, paymentFile);

            if (!uploadError) {
              uploadedPaymentUrls.push(filePath);
            } else {
              console.error('Error uploading payment screenshot:', uploadError);
            }
          }

          if (uploadedPaymentUrls.length > 0) {
            // Store all URLs as comma-separated string
            const screenshotUrlsString = uploadedPaymentUrls.join(',');

            await supabase.from('payment_records').insert({
              order_id: orderData.id,
              amount: formData.amount_paid,
              screenshot_url: screenshotUrlsString,
              submitted_by: user.id,
              notes: 'Submitted with order creation',
            });
          }
        } catch (uploadErr) {
          console.error('Error processing payment screenshots:', uploadErr);
          // Don't fail the order creation, just log the error
        }
      }

      // Send email notification for new order
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        await fetch(`${supabaseUrl}/functions/v1/send-order-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            orderNumber: orderData.order_number || orderData.id.slice(0, 8).toUpperCase(),
            customerName: formData.customer_name,
            customerCompany: formData.customer_company,
            customerEmail: formData.customer_email || undefined,
            productName: formData.product_name,
            productCode: formData.product_name,
            quantity: formData.quantity,
            sellingPrice: formData.selling_price,
            totalAmount: formData.total_sales_amount,
            salesPersonName: formData.sales_person_name,
            estimatedDelivery: formData.estimated_delivery,
            shippingAddress: formData.shipping_address,
            paymentTerms: formData.payment_terms,
            notes: formData.customer_notes,
          }),
        });
        console.log('Order notification email sent');
      } catch (emailErr) {
        console.error('Error sending order notification email:', emailErr);
        // Don't fail the order creation, just log the error
      }

      // Send Slack notification for new order
      try {
        await sendSlackNotification('new_order', {
          order_number: orderData.order_number || orderData.id.slice(0, 8).toUpperCase(),
          customer_name: formData.customer_name,
          customer_company: formData.customer_company,
          product_name: formData.product_name,
          quantity: formData.quantity,
          total_sales_amount: formData.total_sales_amount,
          sales_person_name: formData.sales_person_name || salesPersonName,
        });
      } catch (slackErr) {
        console.error('Error sending Slack notification:', slackErr);
        // Don't fail the order creation, just log the error
      }

      toast.success('Order created successfully');
      // Fire KYC onboarding (server-side: invite to portal + send KYC email if new customer)
      try {
        if (orderData?.id && formData.customer_email) {
          supabase.functions.invoke('kyc-handler', {
            body: { action: 'onboard_order', order_id: orderData.id },
          }).catch((e) => console.error('kyc onboarding failed:', e));
        }
      } catch (e) { console.error('kyc onboarding invoke error:', e); }
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
      // Get current order to check for status change
      const currentOrder = orders.find(o => o.id === orderId);
      const oldStatus = currentOrder?.status;

      const { data, error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', orderId)
        .select('id')
        .maybeSingle();

      const touchedPhone = Object.prototype.hasOwnProperty.call(updates, 'customer_phone');
      if (error) {
        throw new Error(mapOrderUpdateError(error as any, { touchedPhone }));
      }
      if (!data) {
        throw new Error(mapOrderUpdateError(null, { touchedPhone }));
      }

      const updatedAt = new Date().toISOString();
      queryClient.setQueryData<Order[]>(['orders', user?.id, role], (current = []) =>
        current.map((order) =>
          order.id === orderId
            ? ({ ...order, ...updates, updated_at: updatedAt } as Order)
            : order,
        ),
      );
      await queryClient.invalidateQueries({ queryKey: ['orders', user?.id, role] });
      window.dispatchEvent(new CustomEvent('orders:updated', { detail: { orderId } }));

      // Send Slack notification if status changed
      if (updates.status && oldStatus && updates.status !== oldStatus) {
        try {
          await sendSlackNotification('status_change', {
            order_number: currentOrder?.order_number || orderId.slice(0, 8).toUpperCase(),
            customer_name: currentOrder?.customer_name || 'Unknown',
            old_status: oldStatus.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            new_status: updates.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          });
        } catch (slackErr) {
          console.error('Error sending Slack notification:', slackErr);
        }
      }

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
      // Soft delete - move to "Deleted Orders" tab
      const { data: profileData } = await supabase
        .from('profiles')
        .select('name')
        .eq('user_id', user?.id || '')
        .maybeSingle();

      const { error } = await supabase
        .from('orders')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: user?.id || null,
          deleted_by_name: profileData?.name || null,
        } as any)
        .eq('id', orderId);

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order moved to Deleted Orders');
      return true;
    } catch (error: any) {
      console.error('Error deleting order:', error);
      toast.error(error.message || 'Failed to delete order');
      return false;
    }
  };

  const restoreOrder = async (orderId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ deleted_at: null, deleted_by: null, deleted_by_name: null, delete_reason: null } as any)
        .eq('id', orderId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['deleted-orders'] });
      toast.success('Order restored');
      return true;
    } catch (error: any) {
      console.error('Error restoring order:', error);
      toast.error(error.message || 'Failed to restore order');
      return false;
    }
  };

  const purgeOrder = async (orderId: string): Promise<boolean> => {
    try {
      const { error } = await supabase.from('orders').delete().eq('id', orderId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['deleted-orders'] });
      toast.success('Order permanently deleted');
      return true;
    } catch (error: any) {
      console.error('Error purging order:', error);
      toast.error(error.message || 'Failed to permanently delete order');
      return false;
    }
  };

  const escalateOrder = async (orderId: string, reason: string): Promise<boolean> => {
    if (!user) {
      toast.error('You must be logged in to escalate orders');
      return false;
    }

    try {
      // Update order with escalation info and set priority to 1
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          is_escalated: true,
          escalated_at: new Date().toISOString(),
          escalated_by: user.id,
          escalation_reason: reason,
          priority: 1, // Set to highest priority
        })
        .eq('id', orderId);

      if (updateError) throw updateError;

      // Get order details for notification
      const { data: orderData } = await supabase
        .from('orders')
        .select('product_name, customer_name, customer_company')
        .eq('id', orderId)
        .single();

      // Create notification for admin and supply chain
      const { error: notifError } = await supabase
        .from('notifications')
        .insert({
          order_id: orderId,
          type: 'order_escalation',
          title: 'Order Escalated - Priority 1',
          message: `Order for ${orderData?.customer_name || 'Unknown'} (${orderData?.customer_company || 'Unknown'}) - ${orderData?.product_name || 'Unknown'} has been escalated. Reason: ${reason}`,
          target_role: null, // null means visible to all relevant roles (admin, supply_chain)
        });

      if (notifError) {
        console.error('Error creating notification:', notifError);
        // Don't fail the escalation just because notification failed
      }

      toast.success('Order escalated successfully');
      return true;
    } catch (error: any) {
      console.error('Error escalating order:', error);
      toast.error(error.message || 'Failed to escalate order');
      return false;
    }
  };

  return {
    orders,
    loading,
    createOrder,
    updateOrder,
    deleteOrder,
    restoreOrder,
    purgeOrder,
    escalateOrder,
    refetch,
  };
}

export function useDeletedOrders() {
  const { user, role } = useAuth();

  const query = useQuery({
    queryKey: ['deleted-orders', user?.id, role],
    enabled: !!user && (role === 'admin' || role === 'supply_chain' || role === 'finance' || role === 'sales'),
    queryFn: async (): Promise<Order[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
        .limit(2000);
      if (error) {
        console.error('Error fetching deleted orders:', error);
        return [];
      }
      return (data || []).map((order: any) => ({
        ...order,
        status: order.status as OrderStatus,
        order_type: (order.order_type || 'prepaid') as OrderType,
        customer_type: (order.customer_type || 'b2b') as CustomerType,
        payment_status: (order.payment_status || 'pending') as PaymentStatus,
        order_outcome: (order.order_outcome || 'pending') as OrderOutcome,
      })) as Order[];
    },
    staleTime: 60_000,
  });

  return {
    deletedOrders: query.data ?? [],
    loading: query.isLoading,
    refetch: query.refetch,
  };
}
