import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface PricelistItem {
  id: string;
  product_name: string;
  product_category: string;
  brand: string | null;
  description: string | null;
  unit_price: number | null;
  currency: string;
  availability: string;
  lead_time: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface PricelistFormData {
  product_name: string;
  product_category: string;
  brand?: string;
  description?: string;
  unit_price?: number;
  currency?: string;
  availability?: string;
  lead_time?: string;
  notes?: string;
}

export function usePricelist() {
  const [items, setItems] = useState<PricelistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchItems = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('pricelist')
        .select('*')
        .order('product_name', { ascending: true });

      if (error) throw error;
      setItems(data || []);
    } catch (error: any) {
      console.error('Error fetching pricelist:', error);
      toast.error('Failed to fetch pricelist');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const createItem = async (formData: PricelistFormData): Promise<boolean> => {
    if (!user) {
      toast.error('You must be logged in');
      return false;
    }

    try {
      const { error } = await supabase
        .from('pricelist')
        .insert({
          ...formData,
          created_by: user.id,
        });

      if (error) throw error;
      toast.success('Product added to pricelist');
      await fetchItems();
      return true;
    } catch (error: any) {
      console.error('Error creating pricelist item:', error);
      toast.error(error.message || 'Failed to add product');
      return false;
    }
  };

  const updateItem = async (id: string, updates: Partial<PricelistFormData>): Promise<boolean> => {
    if (!user) {
      toast.error('You must be logged in');
      return false;
    }

    try {
      const { error } = await supabase
        .from('pricelist')
        .update({
          ...updates,
          updated_by: user.id,
        })
        .eq('id', id);

      if (error) throw error;
      toast.success('Product updated');
      await fetchItems();
      return true;
    } catch (error: any) {
      console.error('Error updating pricelist item:', error);
      toast.error(error.message || 'Failed to update product');
      return false;
    }
  };

  const deleteItem = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('pricelist')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Product removed from pricelist');
      await fetchItems();
      return true;
    } catch (error: any) {
      console.error('Error deleting pricelist item:', error);
      toast.error(error.message || 'Failed to remove product');
      return false;
    }
  };

  const bulkInsert = async (items: PricelistFormData[]): Promise<boolean> => {
    if (!user) {
      toast.error('You must be logged in');
      return false;
    }

    try {
      const itemsWithUser = items.map(item => ({
        ...item,
        created_by: user.id,
      }));

      const { error } = await supabase
        .from('pricelist')
        .insert(itemsWithUser);

      if (error) throw error;
      toast.success(`${items.length} products added to pricelist`);
      await fetchItems();
      return true;
    } catch (error: any) {
      console.error('Error bulk inserting pricelist items:', error);
      toast.error(error.message || 'Failed to import products');
      return false;
    }
  };

  const clearAndReplace = async (newItems: PricelistFormData[]): Promise<boolean> => {
    if (!user) {
      toast.error('You must be logged in');
      return false;
    }

    try {
      // Delete all existing items
      const { error: deleteError } = await supabase
        .from('pricelist')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (deleteError) throw deleteError;

      // Insert new items
      if (newItems.length > 0) {
        const itemsWithUser = newItems.map(item => ({
          ...item,
          created_by: user.id,
        }));

        const { error: insertError } = await supabase
          .from('pricelist')
          .insert(itemsWithUser);

        if (insertError) throw insertError;
      }

      toast.success(`Pricelist replaced with ${newItems.length} products`);
      await fetchItems();
      return true;
    } catch (error: any) {
      console.error('Error replacing pricelist:', error);
      toast.error(error.message || 'Failed to replace pricelist');
      return false;
    }
  };

  return {
    items,
    loading,
    refetch: fetchItems,
    createItem,
    updateItem,
    deleteItem,
    bulkInsert,
    clearAndReplace,
  };
}
