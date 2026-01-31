import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useEditHistory } from '@/hooks/useEditHistory';
import { toast } from 'sonner';

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'partial' | 'overdue' | 'cancelled';

export const INVOICE_STATUSES: { value: InvoiceStatus; label: string; color: string }[] = [
  { value: 'draft', label: 'Draft', color: 'bg-gray-500' },
  { value: 'sent', label: 'Sent', color: 'bg-blue-500' },
  { value: 'paid', label: 'Paid', color: 'bg-green-500' },
  { value: 'partial', label: 'Partial', color: 'bg-yellow-500' },
  { value: 'overdue', label: 'Overdue', color: 'bg-red-500' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-gray-400' },
];

export interface InvoiceItem {
  id?: string;
  invoice_id?: string;
  product_name: string;
  product_code?: string;
  product_category?: string;
  hsn_sac_code?: string;
  description?: string;
  quantity: number;
  unit_price: number;
  gst_percent: number;
  gst_amount: number;
  price_includes_gst: boolean;
  total_amount: number;
}

export interface InvoicePayment {
  id: string;
  invoice_id: string;
  amount: number;
  payment_date: string;
  payment_method?: string;
  reference_number?: string;
  notes?: string;
  recorded_by: string;
  recorded_by_name: string;
  created_at: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_company?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  customer_gst?: string;
  customer_state?: string;
  shipping_name?: string;
  shipping_company?: string;
  shipping_address?: string;
  shipping_state?: string;
  shipping_phone?: string;
  subtotal: number;
  total_gst: number;
  discount_amount: number;
  discount_percent: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  status: InvoiceStatus;
  invoice_date: string;
  due_date?: string;
  paid_date?: string;
  notes?: string;
  terms_and_conditions?: string;
  payment_terms?: string;
  source_type?: string;
  source_id?: string;
  quote_id?: string;
  order_id?: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  items?: InvoiceItem[];
  payments?: InvoicePayment[];
}

export interface InvoiceFormData {
  customer_name: string;
  customer_company?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  customer_gst?: string;
  customer_state?: string;
  shipping_name?: string;
  shipping_company?: string;
  shipping_address?: string;
  shipping_state?: string;
  shipping_phone?: string;
  discount_amount?: number;
  discount_percent?: number;
  invoice_date?: string;
  due_date?: string;
  notes?: string;
  terms_and_conditions?: string;
  payment_terms?: string;
  quote_id?: string;
  order_id?: string;
  items: InvoiceItem[];
}

export function useInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, profile } = useAuth();
  const { recordChanges } = useEditHistory();

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInvoices((data || []) as Invoice[]);
    } catch (error: any) {
      console.error('Error fetching invoices:', error);
      toast.error('Failed to fetch invoices');
    } finally {
      setLoading(false);
    }
  };

  const fetchInvoiceWithItems = async (invoiceId: string): Promise<Invoice | null> => {
    try {
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single();

      if (invoiceError) throw invoiceError;

      const { data: items, error: itemsError } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: true });

      if (itemsError) throw itemsError;

      const { data: payments, error: paymentsError } = await supabase
        .from('invoice_payments')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('payment_date', { ascending: false });

      if (paymentsError) throw paymentsError;

      return { 
        ...(invoice as Invoice), 
        items: (items || []) as InvoiceItem[],
        payments: (payments || []) as InvoicePayment[]
      };
    } catch (error: any) {
      console.error('Error fetching invoice:', error);
      toast.error('Failed to fetch invoice details');
      return null;
    }
  };

  const createInvoice = async (data: InvoiceFormData): Promise<boolean> => {
    if (!user || !profile) {
      toast.error('You must be logged in to create an invoice');
      return false;
    }

    try {
      // Calculate totals
      const subtotal = data.items.reduce((sum, item) => {
        const basePrice = item.price_includes_gst 
          ? item.unit_price / (1 + item.gst_percent / 100)
          : item.unit_price;
        return sum + (basePrice * item.quantity);
      }, 0);

      const totalGst = data.items.reduce((sum, item) => sum + item.gst_amount, 0);
      const discountAmount = data.discount_amount || (data.discount_percent ? subtotal * (data.discount_percent / 100) : 0);
      const totalAmount = subtotal + totalGst - discountAmount;

      // Create invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          customer_name: data.customer_name,
          customer_company: data.customer_company,
          customer_email: data.customer_email,
          customer_phone: data.customer_phone,
          customer_address: data.customer_address,
          customer_gst: data.customer_gst,
          customer_state: data.customer_state,
          shipping_name: data.shipping_name,
          shipping_company: data.shipping_company,
          shipping_address: data.shipping_address,
          shipping_state: data.shipping_state,
          shipping_phone: data.shipping_phone,
          subtotal,
          total_gst: totalGst,
          discount_amount: discountAmount,
          discount_percent: data.discount_percent || 0,
          total_amount: totalAmount,
          balance_due: totalAmount,
          invoice_date: data.invoice_date || new Date().toISOString().split('T')[0],
          due_date: data.due_date,
          notes: data.notes,
          terms_and_conditions: data.terms_and_conditions,
          payment_terms: data.payment_terms,
          quote_id: data.quote_id,
          order_id: data.order_id,
          created_by: user.id,
          created_by_name: profile.name,
        } as any)
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Create invoice items
      const itemsToInsert = data.items.map(item => ({
        invoice_id: invoice.id,
        product_name: item.product_name,
        product_code: item.product_code,
        product_category: item.product_category,
        hsn_sac_code: item.hsn_sac_code,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        gst_percent: item.gst_percent,
        gst_amount: item.gst_amount,
        price_includes_gst: item.price_includes_gst,
        total_amount: item.total_amount,
      }));

      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(itemsToInsert as any);

      if (itemsError) throw itemsError;

      toast.success('Invoice created successfully');
      fetchInvoices();
      return true;
    } catch (error: any) {
      console.error('Error creating invoice:', error);
      toast.error(error.message || 'Failed to create invoice');
      return false;
    }
  };

  const updateInvoiceStatus = async (invoiceId: string, status: InvoiceStatus): Promise<boolean> => {
    try {
      const updateData: any = { status };
      if (status === 'paid') {
        updateData.paid_date = new Date().toISOString().split('T')[0];
      }

      const { error } = await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', invoiceId);

      if (error) throw error;

      toast.success('Invoice status updated');
      fetchInvoices();
      return true;
    } catch (error: any) {
      console.error('Error updating invoice status:', error);
      toast.error('Failed to update invoice status');
      return false;
    }
  };

  const recordPayment = async (
    invoiceId: string, 
    paymentData: { amount: number; payment_date: string; payment_method?: string; reference_number?: string; notes?: string }
  ): Promise<boolean> => {
    if (!user || !profile) {
      toast.error('You must be logged in to record a payment');
      return false;
    }

    try {
      // Insert payment record
      const { error: paymentError } = await supabase
        .from('invoice_payments')
        .insert({
          invoice_id: invoiceId,
          amount: paymentData.amount,
          payment_date: paymentData.payment_date,
          payment_method: paymentData.payment_method,
          reference_number: paymentData.reference_number,
          notes: paymentData.notes,
          recorded_by: user.id,
          recorded_by_name: profile.name,
        });

      if (paymentError) throw paymentError;

      // Get current invoice
      const { data: invoice, error: fetchError } = await supabase
        .from('invoices')
        .select('amount_paid, total_amount')
        .eq('id', invoiceId)
        .single();

      if (fetchError) throw fetchError;

      const newAmountPaid = (invoice.amount_paid || 0) + paymentData.amount;
      const newBalanceDue = invoice.total_amount - newAmountPaid;
      const newStatus: InvoiceStatus = newBalanceDue <= 0 ? 'paid' : 'partial';

      // Update invoice
      const { error: updateError } = await supabase
        .from('invoices')
        .update({
          amount_paid: newAmountPaid,
          balance_due: Math.max(0, newBalanceDue),
          status: newStatus,
          paid_date: newStatus === 'paid' ? new Date().toISOString().split('T')[0] : null,
        })
        .eq('id', invoiceId);

      if (updateError) throw updateError;

      toast.success('Payment recorded successfully');
      fetchInvoices();
      return true;
    } catch (error: any) {
      console.error('Error recording payment:', error);
      toast.error('Failed to record payment');
      return false;
    }
  };

  const deleteInvoice = async (invoiceId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('id', invoiceId);

      if (error) throw error;

      toast.success('Invoice deleted');
      fetchInvoices();
      return true;
    } catch (error: any) {
      console.error('Error deleting invoice:', error);
      toast.error('Failed to delete invoice');
      return false;
    }
  };

  useEffect(() => {
    if (user) {
      fetchInvoices();
    }
  }, [user]);

  return {
    invoices,
    loading,
    fetchInvoices,
    fetchInvoiceWithItems,
    createInvoice,
    updateInvoiceStatus,
    recordPayment,
    deleteInvoice,
  };
}
