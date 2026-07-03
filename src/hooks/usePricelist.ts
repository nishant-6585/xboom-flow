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
  cost_price: number | null;
  website_price: number | null;
  dealer_price: number | null;
  currency: string;
  availability: string;
  lead_time: string | null;
  notes: string | null;
  marketing_collateral_url: string | null;
  marketing_collateral_name: string | null;
  weight_grams: number | null;
  woo_product_id: number | null;
  woo_sku: string | null;
  woo_stock_status: string | null;
  sync_source: string | null;
  website_synced_at: string | null;
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
  cost_price?: number;
  website_price?: number;
  dealer_price?: number;
  currency?: string;
  availability?: string;
  lead_time?: string;
  notes?: string;
  marketing_collateral_url?: string;
  marketing_collateral_name?: string;
  weight_grams?: number | null;
}

export function usePricelist() {
  const [items, setItems] = useState<PricelistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, role } = useAuth();

  const canViewCostPrice = role === 'admin' || role === 'supply_chain';
  const userId = user?.id ?? null;

  const fetchItems = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      // Only show the loading state on the very first fetch — subsequent
      // refetches (e.g. after a window/tab focus that re-issues a Supabase
      // session) should keep the existing list visible instead of flashing
      // a "Loading pricelist..." screen.
      setLoading((prev) => (items.length === 0 ? true : prev));
      
      // Use the full table for admin/supply_chain (includes cost_price)
      // Use the public view for other roles (excludes cost_price)
      
      // Fetch all items by paginating through results (Supabase default limit is 1000)
      let allItems: PricelistItem[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const query = canViewCostPrice
          ? supabase.from('pricelist').select('*').order('product_name', { ascending: true }).range(from, from + batchSize - 1)
          : supabase.from('pricelist_public').select('*').order('product_name', { ascending: true }).range(from, from + batchSize - 1);
        
        const { data, error } = await query;
        
        if (data && data.length > 0) {
          allItems = [...allItems, ...(data as unknown as PricelistItem[])];
          from += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      setItems(allItems);
    } catch (error: any) {
      console.error('Error fetching pricelist:', error);
      toast.error('Failed to fetch pricelist');
    } finally {
      setLoading(false);
    }
    // Intentionally depend only on userId / role-derived flag so a refreshed
    // user object reference (Supabase auto-refresh on tab focus) does not
    // re-trigger the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, canViewCostPrice]);

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

  const syncFromWebsite = async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('woocommerce-products-backfill');
      if (error) throw error;

      const { created = 0, updated = 0, linked = 0, skipped = 0, failed = 0 } = data || {};
      toast.success(
        `Website sync complete — ${created} added, ${updated + linked} updated, ${skipped} skipped` +
          (failed ? `, ${failed} failed` : ''),
      );
      await fetchItems();
      return true;
    } catch (error: any) {
      console.error('Error syncing products from website:', error);
      toast.error(error.message || 'Failed to sync products from website');
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
    syncFromWebsite,
  };
}
