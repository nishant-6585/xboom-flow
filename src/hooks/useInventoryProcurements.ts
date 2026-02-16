import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from './useAuth';
import { sendSlackNotification } from '@/hooks/useSlackSettings';

export interface InventoryProcurement {
  id: string;
  procurement_number: string | null;
  product_name: string;
  product_category: string;
  product_code: string | null;
  quantity: number;
  unit_price: number | null;
  total_amount: number | null;
  supplier_id: string | null;
  supplier_name: string | null;
  payment_terms: string | null;
  payment_due_date: string | null;
  payment_status: string;
  procurement_date: string;
  notes: string | null;
  inventory_id: string | null;
  order_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useInventoryProcurements() {
  const [procurements, setProcurements] = useState<InventoryProcurement[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchProcurements = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('inventory_procurements')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProcurements(data || []);
    } catch (error: any) {
      console.error('Error fetching inventory procurements:', error);
      toast.error('Failed to load inventory procurements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProcurements();
  }, [fetchProcurements]);

  const createProcurement = async (
    procurement: Omit<InventoryProcurement, 'id' | 'created_at' | 'updated_at' | 'created_by'>,
    addToInventory: boolean = true
  ): Promise<InventoryProcurement | null> => {
    try {
      // First, find or create inventory item
      let inventoryId: string | null = null;
      
      if (addToInventory) {
        // Check if inventory item exists
        const { data: existingInventory } = await supabase
          .from('inventory')
          .select('id')
          .eq('product_name', procurement.product_name)
          .eq('product_category', procurement.product_category)
          .single();

        if (existingInventory) {
          inventoryId = existingInventory.id;
        } else {
          // Create new inventory item
          const { data: newInventory, error: inventoryError } = await supabase
            .from('inventory')
            .insert({
              product_name: procurement.product_name,
              product_category: procurement.product_category,
              current_stock: 0,
              min_stock_level: 0,
            })
            .select()
            .single();

          if (inventoryError) throw inventoryError;
          inventoryId = newInventory.id;
        }
      }

      // Create procurement record
      const { data, error } = await supabase
        .from('inventory_procurements')
        .insert({
          ...procurement,
          inventory_id: inventoryId,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Create inventory transaction to add stock
      if (inventoryId && addToInventory) {
        const { error: transactionError } = await supabase
          .from('inventory_transactions')
          .insert({
            inventory_id: inventoryId,
            inventory_procurement_id: data.id,
            quantity: procurement.quantity,
            transaction_type: 'procurement_in',
            notes: `Standalone procurement from ${procurement.supplier_name || 'Unknown supplier'}`,
            created_by: user?.id,
          });

        if (transactionError) {
          console.error('Error creating inventory transaction:', transactionError);
        }
      }

      toast.success('Procurement created successfully');
      fetchProcurements();

      // Send Slack notification for new procurement
      sendSlackNotification('new_procurement', {
        procurement_number: data.procurement_number,
        product_name: procurement.product_name,
        product_category: procurement.product_category,
        quantity: procurement.quantity,
        total_amount: procurement.total_amount,
        supplier_name: procurement.supplier_name,
        payment_status: procurement.payment_status || 'pending',
        payment_due_date: procurement.payment_due_date,
      }).catch(err => console.error('Slack notification failed:', err));

      return data;
    } catch (error: any) {
      console.error('Error creating procurement:', error);
      toast.error('Failed to create procurement');
      return null;
    }
  };

  const updateProcurement = async (
    id: string,
    updates: Partial<InventoryProcurement>
  ): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('inventory_procurements')
        .update(updates)
        .eq('id', id)
        .select('id')
        .single();

      if (error) throw error;

      if (!data) {
        toast.error('Procurement not found or update failed');
        return false;
      }

      toast.success('Procurement updated successfully');
      await fetchProcurements();
      return true;
    } catch (error: any) {
      console.error('Error updating procurement:', error);
      toast.error('Failed to update procurement');
      return false;
    }
  };

  const deleteProcurement = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('inventory_procurements')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Procurement deleted successfully');
      fetchProcurements();
      return true;
    } catch (error: any) {
      console.error('Error deleting procurement:', error);
      toast.error('Failed to delete procurement');
      return false;
    }
  };

  return {
    procurements,
    loading,
    createProcurement,
    updateProcurement,
    deleteProcurement,
    refetch: fetchProcurements,
  };
}
