import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface InventoryItem {
  id: string;
  product_name: string;
  product_category: string;
  current_stock: number;
  min_stock_level: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryTransaction {
  id: string;
  inventory_id: string;
  transaction_type: 'procurement_in' | 'order_fulfilled' | 'customer_return' | 'adjustment';
  quantity: number;
  order_id: string | null;
  order_item_id: string | null;
  reference_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  inventory?: InventoryItem;
}

export const TRANSACTION_TYPES: { value: InventoryTransaction['transaction_type']; label: string; color: string }[] = [
  { value: 'procurement_in', label: 'Procurement In', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'order_fulfilled', label: 'Order Fulfilled', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  { value: 'customer_return', label: 'Customer Return', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  { value: 'adjustment', label: 'Adjustment', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' },
];

export function useInventory() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, role } = useAuth();

  const canManage = role === 'supply_chain' || role === 'admin' || role === 'finance';

  const initialLoadDoneRef = useRef(false);

  const fetchInventory = useCallback(async () => {
    if (!user) {
      setInventory([]);
      setLoading(false);
      return;
    }

    try {
      if (!initialLoadDoneRef.current) {
        setLoading(true);
      }
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('product_name', { ascending: true });

      if (error) throw error;
      setInventory(data || []);
    } catch (error: any) {
      console.error('Error fetching inventory:', error);
      toast.error('Failed to fetch inventory');
    } finally {
      setLoading(false);
      initialLoadDoneRef.current = true;
    }
  }, [user]);

  const fetchTransactions = useCallback(async (inventoryId?: string) => {
    if (!user) return;

    try {
      let query = supabase
        .from('inventory_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (inventoryId) {
        query = query.eq('inventory_id', inventoryId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setTransactions((data || []).map(t => ({
        ...t,
        transaction_type: t.transaction_type as InventoryTransaction['transaction_type'],
      })));
    } catch (error: any) {
      console.error('Error fetching transactions:', error);
    }
  }, [user]);

  useEffect(() => {
    fetchInventory();
    fetchTransactions();
  }, [fetchInventory, fetchTransactions]);

  const createInventoryItem = async (data: {
    product_name: string;
    product_category: string;
    current_stock?: number;
    min_stock_level?: number;
    notes?: string;
  }): Promise<InventoryItem | null> => {
    if (!user || !canManage) {
      toast.error('You do not have permission to manage inventory');
      return null;
    }

    try {
      const { data: item, error } = await supabase
        .from('inventory')
        .insert({
          product_name: data.product_name,
          product_category: data.product_category,
          current_stock: data.current_stock || 0,
          min_stock_level: data.min_stock_level || 0,
          notes: data.notes || null,
        })
        .select()
        .single();

      if (error) throw error;
      toast.success('Inventory item created');
      fetchInventory();
      return item;
    } catch (error: any) {
      console.error('Error creating inventory item:', error);
      toast.error(error.message || 'Failed to create inventory item');
      return null;
    }
  };

  const updateInventoryItem = async (
    id: string,
    updates: Partial<InventoryItem>
  ): Promise<boolean> => {
    if (!canManage) {
      toast.error('You do not have permission to manage inventory');
      return false;
    }

    try {
      const { error } = await supabase
        .from('inventory')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      toast.success('Inventory item updated');
      fetchInventory();
      return true;
    } catch (error: any) {
      console.error('Error updating inventory item:', error);
      toast.error(error.message || 'Failed to update inventory item');
      return false;
    }
  };

  const deleteInventoryItem = async (id: string): Promise<boolean> => {
    if (!canManage) {
      toast.error('You do not have permission to manage inventory');
      return false;
    }

    try {
      const { error } = await supabase
        .from('inventory')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Inventory item deleted');
      fetchInventory();
      return true;
    } catch (error: any) {
      console.error('Error deleting inventory item:', error);
      toast.error(error.message || 'Failed to delete inventory item');
      return false;
    }
  };

  const createTransaction = async (data: {
    inventory_id: string;
    transaction_type: InventoryTransaction['transaction_type'];
    quantity: number;
    order_id?: string;
    order_item_id?: string;
    reference_number?: string;
    notes?: string;
  }): Promise<boolean> => {
    if (!user || !canManage) {
      toast.error('You do not have permission to manage inventory');
      return false;
    }

    try {
      const { error } = await supabase
        .from('inventory_transactions')
        .insert({
          inventory_id: data.inventory_id,
          transaction_type: data.transaction_type,
          quantity: data.quantity,
          order_id: data.order_id || null,
          order_item_id: data.order_item_id || null,
          reference_number: data.reference_number || null,
          notes: data.notes || null,
          created_by: user.id,
        });

      if (error) throw error;
      toast.success('Transaction recorded');
      fetchInventory();
      fetchTransactions();
      return true;
    } catch (error: any) {
      console.error('Error creating transaction:', error);
      toast.error(error.message || 'Failed to record transaction');
      return false;
    }
  };

  const getOrCreateInventoryItem = async (
    productName: string,
    productCategory: string
  ): Promise<InventoryItem | null> => {
    // Check if item exists
    const existing = inventory.find(
      i => i.product_name === productName && i.product_category === productCategory
    );
    if (existing) return existing;

    // Create new item
    return await createInventoryItem({
      product_name: productName,
      product_category: productCategory,
      current_stock: 0,
    });
  };

  const addStockFromProcurement = async (
    productName: string,
    productCategory: string,
    quantity: number,
    notes?: string
  ): Promise<boolean> => {
    const item = await getOrCreateInventoryItem(productName, productCategory);
    if (!item) return false;

    return await createTransaction({
      inventory_id: item.id,
      transaction_type: 'procurement_in',
      quantity: quantity, // positive for stock in
      notes,
    });
  };

  const fulfillFromStock = async (
    productName: string,
    productCategory: string,
    quantity: number,
    orderId?: string,
    orderItemId?: string,
    notes?: string
  ): Promise<boolean> => {
    const item = inventory.find(
      i => i.product_name === productName && i.product_category === productCategory
    );
    if (!item) {
      toast.error('Product not found in inventory');
      return false;
    }
    if (item.current_stock < quantity) {
      toast.error(`Insufficient stock. Available: ${item.current_stock}`);
      return false;
    }

    return await createTransaction({
      inventory_id: item.id,
      transaction_type: 'order_fulfilled',
      quantity: -quantity, // negative for stock out
      order_id: orderId,
      order_item_id: orderItemId,
      notes,
    });
  };

  const addReturnToStock = async (
    productName: string,
    productCategory: string,
    quantity: number,
    orderId?: string,
    notes?: string
  ): Promise<boolean> => {
    const item = await getOrCreateInventoryItem(productName, productCategory);
    if (!item) return false;

    return await createTransaction({
      inventory_id: item.id,
      transaction_type: 'customer_return',
      quantity: quantity, // positive for stock in
      order_id: orderId,
      notes,
    });
  };

  const adjustStock = async (
    inventoryId: string,
    quantity: number,
    notes?: string
  ): Promise<boolean> => {
    return await createTransaction({
      inventory_id: inventoryId,
      transaction_type: 'adjustment',
      quantity, // can be positive or negative
      notes,
    });
  };

  return {
    inventory,
    transactions,
    loading,
    canManage,
    fetchInventory,
    fetchTransactions,
    createInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    createTransaction,
    addStockFromProcurement,
    fulfillFromStock,
    addReturnToStock,
    adjustStock,
    getOrCreateInventoryItem,
  };
}