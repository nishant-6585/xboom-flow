import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SupplierQuotation {
  id: string;
  order_id: string | null;
  order_item_id: string | null;
  supplier_id: string;
  unit_price: number;
  quantity: number;
  total_amount: number | null;
  payment_terms: string | null;
  lead_time: string | null;
  validity_date: string | null;
  notes: string | null;
  is_selected: boolean;
  quoted_at: string;
  quoted_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  supplier?: {
    id: string;
    name: string;
    brand_name: string | null;
    preference: 'low' | 'medium' | 'high';
    contact_name: string;
    mobile: string | null;
    email: string | null;
    product_category: string;
    products: string[] | null;
  };
}

export const useSupplierQuotations = (orderId?: string, orderItemId?: string) => {
  const [quotations, setQuotations] = useState<SupplierQuotation[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchQuotations = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('supplier_quotations')
        .select(`
          *,
          supplier:suppliers(id, name, brand_name, preference, contact_name, mobile, email, product_category, products)
        `)
        .order('unit_price', { ascending: true });

      if (orderId) {
        query = query.eq('order_id', orderId);
      }
      if (orderItemId) {
        query = query.eq('order_item_id', orderItemId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setQuotations(data || []);
    } catch (error: any) {
      console.error('Error fetching quotations:', error);
      toast.error('Failed to fetch quotations');
    } finally {
      setLoading(false);
    }
  };

  const createQuotation = async (
    quotationData: Omit<SupplierQuotation, 'id' | 'created_at' | 'updated_at' | 'total_amount' | 'quoted_at' | 'supplier'>
  ): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('supplier_quotations')
        .insert({
          ...quotationData,
          quoted_by: user?.id
        });

      if (error) throw error;
      toast.success('Quotation added successfully');
      await fetchQuotations();
      return true;
    } catch (error: any) {
      console.error('Error creating quotation:', error);
      toast.error('Failed to add quotation');
      return false;
    }
  };

  const updateQuotation = async (id: string, updates: Partial<SupplierQuotation>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('supplier_quotations')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      toast.success('Quotation updated');
      await fetchQuotations();
      return true;
    } catch (error: any) {
      console.error('Error updating quotation:', error);
      toast.error('Failed to update quotation');
      return false;
    }
  };

  const selectQuotation = async (quotationId: string, orderId: string, orderItemId?: string): Promise<boolean> => {
    try {
      // First, deselect all quotations for this order/item
      let deselectQuery = supabase
        .from('supplier_quotations')
        .update({ is_selected: false })
        .eq('order_id', orderId);
      
      if (orderItemId) {
        deselectQuery = deselectQuery.eq('order_item_id', orderItemId);
      }
      
      await deselectQuery;

      // Then select the chosen one
      const { error } = await supabase
        .from('supplier_quotations')
        .update({ is_selected: true, updated_at: new Date().toISOString() })
        .eq('id', quotationId);

      if (error) throw error;
      toast.success('Supplier selected for procurement');
      await fetchQuotations();
      return true;
    } catch (error: any) {
      console.error('Error selecting quotation:', error);
      toast.error('Failed to select quotation');
      return false;
    }
  };

  const deleteQuotation = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('supplier_quotations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Quotation deleted');
      await fetchQuotations();
      return true;
    } catch (error: any) {
      console.error('Error deleting quotation:', error);
      toast.error('Failed to delete quotation');
      return false;
    }
  };

  useEffect(() => {
    if (orderId || orderItemId) {
      fetchQuotations();
    }
  }, [orderId, orderItemId]);

  return {
    quotations,
    loading,
    fetchQuotations,
    createQuotation,
    updateQuotation,
    selectQuotation,
    deleteQuotation
  };
};
