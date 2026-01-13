import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type SupplierPreference = 'low' | 'medium' | 'high';

export interface Supplier {
  id: string;
  name: string;
  brand_name: string | null;
  gst_number: string | null;
  contact_name: string;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_account_holder: string | null;
  product_category: string;
  products: string[] | null;
  preference: SupplierPreference;
  status: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface SupplierPayment {
  id: string;
  supplier_id: string;
  order_id: string | null;
  amount: number;
  payment_type: string;
  payment_mode: string | null;
  reference_number: string | null;
  notes: string | null;
  payment_date: string;
  created_at: string;
  created_by: string | null;
}

export interface SupplierLedger {
  supplier: Supplier;
  totalOrders: number;
  totalOrderValue: number;
  totalPaid: number;
  pendingAmount: number;
  payments: SupplierPayment[];
}

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const requireValidSession = useCallback(async (): Promise<boolean> => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) {
      toast.error('Your session expired. Please sign in again.');
      await supabase.auth.signOut();
      return false;
    }
    return true;
  }, []);

  const fetchSuppliers = useCallback(async () => {
    if (!user) {
      setSuppliers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;

      setSuppliers((data || []) as Supplier[]);
    } catch (error: any) {
      console.error('Error fetching suppliers:', error);
      toast.error('Failed to fetch suppliers');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const createSupplier = async (
    supplierData: Omit<Supplier, 'id' | 'created_at' | 'updated_at' | 'created_by'>
  ): Promise<boolean> => {
    if (!user) {
      toast.error('You must be logged in');
      return false;
    }

    if (!(await requireValidSession())) {
      return false;
    }

    try {
      const { error } = await supabase.from('suppliers').insert({
        ...supplierData,
        created_by: user.id,
      });

      if (error) throw error;

      toast.success('Supplier created successfully');
      await fetchSuppliers();
      return true;
    } catch (error: any) {
      console.error('Error creating supplier:', error);
      toast.error(error.message || 'Failed to create supplier');
      return false;
    }
  };

  const bulkImportSuppliers = async (
    suppliersData: Omit<Supplier, 'id' | 'created_at' | 'updated_at' | 'created_by'>[]
  ): Promise<boolean> => {
    if (!user) {
      toast.error('You must be logged in');
      return false;
    }

    if (!(await requireValidSession())) {
      return false;
    }

    try {
      const dataWithCreatedBy = suppliersData.map(supplier => ({
        ...supplier,
        created_by: user.id,
      }));

      const { error } = await supabase.from('suppliers').insert(dataWithCreatedBy);

      if (error) throw error;

      toast.success(`Successfully imported ${suppliersData.length} suppliers`);
      await fetchSuppliers();
      return true;
    } catch (error: any) {
      console.error('Error importing suppliers:', error);
      toast.error(error.message || 'Failed to import suppliers');
      return false;
    }
  };

  const updateSupplier = async (
    id: string,
    updates: Partial<Supplier>
  ): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('suppliers')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      toast.success('Supplier updated successfully');
      await fetchSuppliers();
      return true;
    } catch (error: any) {
      console.error('Error updating supplier:', error);
      toast.error(error.message || 'Failed to update supplier');
      return false;
    }
  };

  const deleteSupplier = async (id: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Supplier deleted successfully');
      await fetchSuppliers();
      return true;
    } catch (error: any) {
      console.error('Error deleting supplier:', error);
      toast.error(error.message || 'Failed to delete supplier');
      return false;
    }
  };

  return {
    suppliers,
    loading,
    createSupplier,
    bulkImportSuppliers,
    updateSupplier,
    deleteSupplier,
    refetch: fetchSuppliers,
  };
}

export function useSupplierPayments(supplierId?: string) {
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchPayments = useCallback(async () => {
    if (!user) {
      setPayments([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      let query = supabase
        .from('supplier_payments')
        .select('*')
        .order('payment_date', { ascending: false });

      if (supplierId) {
        query = query.eq('supplier_id', supplierId);
      }

      const { data, error } = await query;

      if (error) throw error;

      setPayments((data || []) as SupplierPayment[]);
    } catch (error: any) {
      console.error('Error fetching supplier payments:', error);
    } finally {
      setLoading(false);
    }
  }, [user, supplierId]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const createPayment = async (
    paymentData: Omit<SupplierPayment, 'id' | 'created_at' | 'created_by'>
  ): Promise<boolean> => {
    if (!user) {
      toast.error('You must be logged in');
      return false;
    }

    try {
      const { error } = await supabase.from('supplier_payments').insert({
        ...paymentData,
        created_by: user.id,
      });

      if (error) throw error;

      toast.success('Payment recorded successfully');
      await fetchPayments();
      return true;
    } catch (error: any) {
      console.error('Error creating payment:', error);
      toast.error(error.message || 'Failed to record payment');
      return false;
    }
  };

  const deletePayment = async (id: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('supplier_payments')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Payment deleted');
      await fetchPayments();
      return true;
    } catch (error: any) {
      console.error('Error deleting payment:', error);
      toast.error(error.message || 'Failed to delete payment');
      return false;
    }
  };

  return {
    payments,
    loading,
    createPayment,
    deletePayment,
    refetch: fetchPayments,
  };
}

export function useSupplierLedger(supplierId: string) {
  const [ledger, setLedger] = useState<SupplierLedger | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchLedger = useCallback(async () => {
    if (!user || !supplierId) {
      setLedger(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Fetch supplier
      const { data: supplier, error: supplierError } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', supplierId)
        .maybeSingle();

      if (supplierError) throw supplierError;
      if (!supplier) {
        setLedger(null);
        return;
      }

      // Fetch orders linked to this supplier
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, procurement_rate, quantity')
        .eq('supplier_id', supplierId);

      if (ordersError) throw ordersError;

      // Fetch payments to this supplier
      const { data: payments, error: paymentsError } = await supabase
        .from('supplier_payments')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('payment_date', { ascending: false });

      if (paymentsError) throw paymentsError;

      const totalOrders = orders?.length || 0;
      const totalOrderValue = orders?.reduce((sum, o) => {
        return sum + ((o.procurement_rate || 0) * (o.quantity || 1));
      }, 0) || 0;
      const totalPaid = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

      setLedger({
        supplier: supplier as Supplier,
        totalOrders,
        totalOrderValue,
        totalPaid,
        pendingAmount: totalOrderValue - totalPaid,
        payments: (payments || []) as SupplierPayment[],
      });
    } catch (error: any) {
      console.error('Error fetching supplier ledger:', error);
      toast.error('Failed to fetch supplier ledger');
    } finally {
      setLoading(false);
    }
  }, [user, supplierId]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  return {
    ledger,
    loading,
    refetch: fetchLedger,
  };
}
