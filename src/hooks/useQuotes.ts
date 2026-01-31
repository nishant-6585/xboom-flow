import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useEditHistory } from '@/hooks/useEditHistory';
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

export const PAYMENT_TERMS_OPTIONS = [
  { value: 'advance_100', label: 'Advance 100%' },
  { value: '60_40', label: '60-40%' },
  { value: '50_50', label: '50-50%' },
  { value: 'custom', label: 'Custom' },
];

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
  payment_terms?: string;
  payment_terms_custom?: string;
  approved_by?: string;
  approved_by_name?: string;
  approved_at?: string;
  internal_notes?: string;
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
  payment_terms?: string;
  payment_terms_custom?: string;
  internal_notes?: string;
  source_type?: string;
  source_id?: string;
  items: QuoteItem[];
}

export function useQuotes() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, profile } = useAuth();
  const { recordChanges } = useEditHistory();

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
          payment_terms: data.payment_terms,
          payment_terms_custom: data.payment_terms_custom,
          internal_notes: data.internal_notes,
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

  const updateQuote = async (quoteId: string, data: QuoteFormData, originalQuote?: Quote): Promise<boolean> => {
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

      // Track changes if original quote provided
      if (originalQuote) {
        const changes: Record<string, { old: any; new: any }> = {};
        
        if (originalQuote.customer_name !== data.customer_name) {
          changes['customer_name'] = { old: originalQuote.customer_name, new: data.customer_name };
        }
        if (originalQuote.customer_company !== data.customer_company) {
          changes['customer_company'] = { old: originalQuote.customer_company, new: data.customer_company };
        }
        if (originalQuote.customer_email !== data.customer_email) {
          changes['customer_email'] = { old: originalQuote.customer_email, new: data.customer_email };
        }
        if (originalQuote.customer_phone !== data.customer_phone) {
          changes['customer_phone'] = { old: originalQuote.customer_phone, new: data.customer_phone };
        }
        if (originalQuote.customer_address !== data.customer_address) {
          changes['customer_address'] = { old: originalQuote.customer_address, new: data.customer_address };
        }
        if (originalQuote.customer_gst !== data.customer_gst) {
          changes['customer_gst'] = { old: originalQuote.customer_gst, new: data.customer_gst };
        }
        if (originalQuote.customer_state !== data.customer_state) {
          changes['customer_state'] = { old: originalQuote.customer_state, new: data.customer_state };
        }
        if (originalQuote.discount_amount !== discountAmount) {
          changes['discount_amount'] = { old: originalQuote.discount_amount, new: discountAmount };
        }
        if (originalQuote.total_amount !== totalAmount) {
          changes['total_amount'] = { old: originalQuote.total_amount, new: totalAmount };
        }
        if (originalQuote.valid_until !== data.valid_until) {
          changes['valid_until'] = { old: originalQuote.valid_until, new: data.valid_until };
        }
        if (originalQuote.notes !== data.notes) {
          changes['notes'] = { old: originalQuote.notes, new: data.notes };
        }
        if (originalQuote.terms_and_conditions !== data.terms_and_conditions) {
          changes['terms_and_conditions'] = { old: originalQuote.terms_and_conditions, new: data.terms_and_conditions };
        }

        // Track item changes
        const oldItemCount = originalQuote.items?.length || 0;
        const newItemCount = data.items.length;
        if (oldItemCount !== newItemCount) {
          changes['items_count'] = { old: oldItemCount, new: newItemCount };
        }

        // Record changes to edit history
        if (Object.keys(changes).length > 0) {
          await recordChanges('quotes', quoteId, changes, profile.name);
        }
      }

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
          payment_terms: data.payment_terms,
          payment_terms_custom: data.payment_terms_custom,
          internal_notes: data.internal_notes,
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

  const approveQuote = async (quoteId: string): Promise<boolean> => {
    if (!user || !profile) {
      toast.error('You must be logged in to approve a quote');
      return false;
    }

    try {
      const { error } = await supabase
        .from('quotes')
        .update({
          approved_by: user.id,
          approved_by_name: profile.name,
          approved_at: new Date().toISOString(),
        })
        .eq('id', quoteId);

      if (error) throw error;

      toast.success('Quote approved');
      fetchQuotes();
      return true;
    } catch (error: any) {
      console.error('Error approving quote:', error);
      toast.error('Failed to approve quote');
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
    approveQuote,
  };
}
