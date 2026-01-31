import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';

export const QUOTE_STATUSES: { value: QuoteStatus; label: string; color: string }[] = [
  { value: 'draft', label: 'Draft', color: 'bg-gray-500' },
  { value: 'sent', label: 'Sent', color: 'bg-blue-500' },
  { value: 'accepted', label: 'Accepted', color: 'bg-green-500' },
  { value: 'rejected', label: 'Rejected', color: 'bg-red-500' },
  { value: 'expired', label: 'Expired', color: 'bg-orange-500' },
  { value: 'converted', label: 'Converted', color: 'bg-purple-500' },
];

export interface QuoteItem {
  id?: string;
  quote_id?: string;
  product_name: string;
  product_code?: string;
  product_category?: string;
  description?: string;
  quantity: number;
  unit_price: number;
  gst_percent: number;
  gst_amount: number;
  price_includes_gst: boolean;
  total_amount: number;
}

export interface Quote {
  id: string;
  quote_number: string;
  customer_name: string;
  customer_company?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  customer_gst?: string;
  customer_state?: string;
  subtotal: number;
  total_gst: number;
  discount_amount: number;
  discount_percent: number;
  total_amount: number;
  status: QuoteStatus;
  valid_until?: string;
  notes?: string;
  terms_and_conditions?: string;
  source_type?: string;
  source_id?: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  items?: QuoteItem[];
}

export interface QuoteFormData {
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
  valid_until?: string;
  notes?: string;
  terms_and_conditions?: string;
  source_type?: string;
  source_id?: string;
  items: QuoteItem[];
}

export function useQuotes() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, profile } = useAuth();

  const fetchQuotes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('quotes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setQuotes((data || []) as Quote[]);
    } catch (error: any) {
      console.error('Error fetching quotes:', error);
      toast.error('Failed to fetch quotes');
    } finally {
      setLoading(false);
    }
  };

  const fetchQuoteWithItems = async (quoteId: string): Promise<Quote | null> => {
    try {
      const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .select('*')
        .eq('id', quoteId)
        .single();

      if (quoteError) throw quoteError;

      const { data: items, error: itemsError } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', quoteId)
        .order('created_at', { ascending: true });

      if (itemsError) throw itemsError;

      return { ...(quote as Quote), items: (items || []) as QuoteItem[] };
    } catch (error: any) {
      console.error('Error fetching quote:', error);
      toast.error('Failed to fetch quote details');
      return null;
    }
  };

  const createQuote = async (data: QuoteFormData): Promise<boolean> => {
    if (!user || !profile) {
      toast.error('You must be logged in to create a quote');
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

      // Create quote
      const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .insert({
          customer_name: data.customer_name,
          customer_company: data.customer_company,
          customer_email: data.customer_email,
          customer_phone: data.customer_phone,
          customer_address: data.customer_address,
          customer_gst: data.customer_gst,
          customer_state: data.customer_state,
          subtotal,
          total_gst: totalGst,
          discount_amount: discountAmount,
          discount_percent: data.discount_percent || 0,
          total_amount: totalAmount,
          valid_until: data.valid_until,
          notes: data.notes,
          terms_and_conditions: data.terms_and_conditions,
          source_type: data.source_type,
          source_id: data.source_id,
          created_by: user.id,
          created_by_name: profile.name,
        })
        .select()
        .single();

      if (quoteError) throw quoteError;

      // Create quote items
      const itemsToInsert = data.items.map(item => ({
        quote_id: quote.id,
        product_name: item.product_name,
        product_code: item.product_code,
        product_category: item.product_category,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        gst_percent: item.gst_percent,
        gst_amount: item.gst_amount,
        price_includes_gst: item.price_includes_gst,
        total_amount: item.total_amount,
      }));

      const { error: itemsError } = await supabase
        .from('quote_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      toast.success('Quote created successfully');
      fetchQuotes();
      return true;
    } catch (error: any) {
      console.error('Error creating quote:', error);
      toast.error(error.message || 'Failed to create quote');
      return false;
    }
  };

  const updateQuoteStatus = async (quoteId: string, status: QuoteStatus): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('quotes')
        .update({ status })
        .eq('id', quoteId);

      if (error) throw error;

      toast.success('Quote status updated');
      fetchQuotes();
      return true;
    } catch (error: any) {
      console.error('Error updating quote status:', error);
      toast.error('Failed to update quote status');
      return false;
    }
  };

  const updateQuote = async (quoteId: string, data: QuoteFormData): Promise<boolean> => {
    if (!user || !profile) {
      toast.error('You must be logged in to update a quote');
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

      // Update quote
      const { error: quoteError } = await supabase
        .from('quotes')
        .update({
          customer_name: data.customer_name,
          customer_company: data.customer_company,
          customer_email: data.customer_email,
          customer_phone: data.customer_phone,
          customer_address: data.customer_address,
          customer_gst: data.customer_gst,
          customer_state: data.customer_state,
          subtotal,
          total_gst: totalGst,
          discount_amount: discountAmount,
          discount_percent: data.discount_percent || 0,
          total_amount: totalAmount,
          valid_until: data.valid_until,
          notes: data.notes,
          terms_and_conditions: data.terms_and_conditions,
        })
        .eq('id', quoteId);

      if (quoteError) throw quoteError;

      // Delete existing items
      const { error: deleteError } = await supabase
        .from('quote_items')
        .delete()
        .eq('quote_id', quoteId);

      if (deleteError) throw deleteError;

      // Insert updated items
      const itemsToInsert = data.items.map(item => ({
        quote_id: quoteId,
        product_name: item.product_name,
        product_code: item.product_code,
        product_category: item.product_category,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        gst_percent: item.gst_percent,
        gst_amount: item.gst_amount,
        price_includes_gst: item.price_includes_gst,
        total_amount: item.total_amount,
      }));

      const { error: itemsError } = await supabase
        .from('quote_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      toast.success('Quote updated successfully');
      fetchQuotes();
      return true;
    } catch (error: any) {
      console.error('Error updating quote:', error);
      toast.error(error.message || 'Failed to update quote');
      return false;
    }
  };

  const deleteQuote = async (quoteId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('quotes')
        .delete()
        .eq('id', quoteId);

      if (error) throw error;

      toast.success('Quote deleted');
      fetchQuotes();
      return true;
    } catch (error: any) {
      console.error('Error deleting quote:', error);
      toast.error('Failed to delete quote');
      return false;
    }
  };

  useEffect(() => {
    if (user) {
      fetchQuotes();
    }
  }, [user]);

  return {
    quotes,
    loading,
    fetchQuotes,
    fetchQuoteWithItems,
    createQuote,
    updateQuote,
    updateQuoteStatus,
    deleteQuote,
  };
}
