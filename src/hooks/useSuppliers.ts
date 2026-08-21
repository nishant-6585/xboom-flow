import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { sendSlackNotification } from '@/hooks/useSlackSettings';
import {
  recordProcurementAudit,
  summarisePayment,
  PROCUREMENT_AUDIT_ACTIONS,
} from '@/lib/procurementAudit';

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

export type PaymentRequestStatus = 'pending' | 'requested' | 'approved' | 'done';

export interface SupplierPayment {
  id: string;
  supplier_id: string;
  order_id: string | null;
  inventory_procurement_id: string | null;
  amount: number;
  payment_type: string;
  payment_mode: string | null;
  reference_number: string | null;
  notes: string | null;
  payment_date: string;
  created_at: string;
  created_by: string | null;
  screenshot_urls: string[] | null;
  payment_request_status: PaymentRequestStatus;
  requested_at: string | null;
  requested_by: string | null;
  requested_by_name: string | null;
  request_notes: string | null;
  approved_at: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
  completed_at: string | null;
  completed_by: string | null;
  completed_by_name: string | null;
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

  const fetchSuppliers = useCallback(async (): Promise<Supplier[]> => {
    if (!user) {
      return [];
    }

    try {
      // Use the SECURITY DEFINER RPC which enforces banking-field masking
      // server-side based on role (admin/finance see banking; supply_chain
      // gets nulls).
      const { data, error } = await supabase.rpc('get_suppliers_safe');

      if (error) throw error;

      const normalizeProducts = (raw: any): string[] | null => {
        if (raw == null) return null;
        if (Array.isArray(raw)) return raw.filter((p) => typeof p === 'string');
        if (typeof raw === 'string') {
          const trimmed = raw.trim();
          if (!trimmed) return null;
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) return parsed.filter((p) => typeof p === 'string');
          } catch {
            // fall through
          }
          return trimmed.split(',').map((p) => p.trim()).filter(Boolean);
        }
        return null;
      };

      const normalized = ((data as any[]) || []).map((row) => ({
        ...row,
        products: normalizeProducts(row?.products),
      }));

      const sorted = normalized.slice().sort((a, b) =>
        (a.name || '').localeCompare(b.name || '')
      );

      return sorted as Supplier[];
    } catch (error: any) {
      console.error('Error fetching suppliers:', error);
      toast.error('Failed to fetch suppliers');
      return [];
    }
  }, [user]);

  const suppliersQuery = useQuery({
    queryKey: ['suppliers', user?.id],
    queryFn: fetchSuppliers,
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const suppliers = suppliersQuery.data ?? [];
  const loading = suppliersQuery.isLoading;
  const refetch = useCallback(() => suppliersQuery.refetch(), [suppliersQuery]);

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
      await refetch();

      // Send Slack notification for new supplier
      sendSlackNotification('new_supplier', {
        supplier_name: supplierData.name,
        brand_name: supplierData.brand_name,
        contact_name: supplierData.contact_name,
        email: supplierData.email,
        phone: supplierData.phone || supplierData.mobile,
        product_category: supplierData.product_category,
        city: supplierData.city,
        preference: supplierData.preference,
      }).catch(err => console.error('Slack notification failed:', err));

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
      await refetch();
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

    if (!(await requireValidSession())) {
      return false;
    }

    try {
      const { data, error } = await supabase
        .from('suppliers')
        .update(updates)
        .eq('id', id)
        .select('id')
        .single();

      if (error) throw error;

      if (!data) {
        toast.error('Supplier not found or update failed');
        return false;
      }

      toast.success('Supplier updated successfully');
      await refetch();
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
      await refetch();
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
    refetch,
  };
}

export function useSupplierPayments(supplierId?: string) {
  const { user, profile } = useAuth();
  const actor = { id: user?.id, name: profile?.name };

  const fetchPayments = useCallback(async (): Promise<SupplierPayment[]> => {
    if (!user) {
      return [];
    }

    try {
      let query = supabase
        .from('supplier_payments')
        .select('*')
        .order('payment_date', { ascending: false });

      if (supplierId) {
        query = query.eq('supplier_id', supplierId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []) as SupplierPayment[];
    } catch (error: any) {
      console.error('Error fetching supplier payments:', error);
      return [];
    }
  }, [user, supplierId]);

  const paymentsQuery = useQuery({
    queryKey: ['supplier-payments', user?.id, supplierId ?? 'all'],
    queryFn: fetchPayments,
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const payments = paymentsQuery.data ?? [];
  const loading = paymentsQuery.isLoading;
  const refetch = useCallback(() => paymentsQuery.refetch(), [paymentsQuery]);

  const uploadScreenshots = async (files: File[]): Promise<string[]> => {
    const { validateFile } = await import('@/lib/fileValidation');
    const urls: string[] = [];
    
    for (const file of files) {
      const validation = validateFile(file, 'screenshots');
      if (!validation.valid) { console.error('Skipping invalid file:', validation.error); continue; }
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.name}`;
      const filePath = `${user?.id}/${fileName}`;
      
      const { error } = await supabase.storage
        .from('supplier-payment-screenshots')
        .upload(filePath, file);
      
      if (error) {
        console.error('Error uploading screenshot:', error);
        continue;
      }
      
      urls.push(filePath);
    }
    
    return urls;
  };

  const getSignedUrl = async (path: string): Promise<string | null> => {
    const { data, error } = await supabase.storage
      .from('supplier-payment-screenshots')
      .createSignedUrl(path, 3600); // 1 hour expiry
    
    if (error) {
      console.error('Error getting signed URL:', error);
      return null;
    }
    
    return data.signedUrl;
  };

  const createPayment = async (
    paymentData: Omit<SupplierPayment, 'id' | 'created_at' | 'created_by' | 'screenshot_urls' | 'payment_request_status' | 'requested_at' | 'requested_by' | 'requested_by_name' | 'request_notes' | 'approved_at' | 'approved_by' | 'approved_by_name' | 'completed_at' | 'completed_by' | 'completed_by_name'>,
    screenshots?: File[]
  ): Promise<boolean> => {
    if (!user) {
      toast.error('You must be logged in');
      return false;
    }

    try {
      let screenshot_urls: string[] | null = null;
      
      if (screenshots && screenshots.length > 0) {
        screenshot_urls = await uploadScreenshots(screenshots);
      }

      const { data: inserted, error } = await supabase
        .from('supplier_payments')
        .insert({
          ...paymentData,
          screenshot_urls,
          payment_request_status: 'done',
          completed_at: new Date().toISOString(),
          completed_by: user.id,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      recordProcurementAudit(actor, PROCUREMENT_AUDIT_ACTIONS.PAYMENT_RECORDED, {
        ...summarisePayment(inserted),
        // Recorded directly as done — it never went through request/approve.
        bypassed_approval: true,
      });

      toast.success('Payment recorded successfully');
      await refetch();
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
      // Read the row before destroying it — a hard delete of a payment record is
      // otherwise completely untraceable.
      const { data: existing } = await supabase
        .from('supplier_payments')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      const { error } = await supabase
        .from('supplier_payments')
        .delete()
        .eq('id', id);

      if (error) throw error;

      recordProcurementAudit(
        actor,
        PROCUREMENT_AUDIT_ACTIONS.PAYMENT_DELETED,
        summarisePayment(existing)
      );

      toast.success('Payment deleted');
      await refetch();
      return true;
    } catch (error: any) {
      console.error('Error deleting payment:', error);
      toast.error(error.message || 'Failed to delete payment');
      return false;
    }
  };

  const requestPayment = async (
    paymentData: Omit<SupplierPayment, 'id' | 'created_at' | 'created_by' | 'screenshot_urls' | 'payment_request_status' | 'requested_at' | 'requested_by' | 'requested_by_name' | 'request_notes' | 'approved_at' | 'approved_by' | 'approved_by_name' | 'completed_at' | 'completed_by' | 'completed_by_name'>,
    requestNotes?: string,
    userName?: string
  ): Promise<boolean> => {
    if (!user) {
      toast.error('You must be logged in');
      return false;
    }

    try {
      const { data: inserted, error } = await supabase
        .from('supplier_payments')
        .insert({
          ...paymentData,
          payment_request_status: 'requested',
          requested_at: new Date().toISOString(),
          requested_by: user.id,
          requested_by_name: userName || 'Unknown',
          request_notes: requestNotes || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      recordProcurementAudit(
        { id: user.id, name: userName || profile?.name },
        PROCUREMENT_AUDIT_ACTIONS.PAYMENT_REQUESTED,
        summarisePayment(inserted)
      );

      toast.success('Payment request submitted');
      await refetch();
      return true;
    } catch (error: any) {
      console.error('Error creating payment request:', error);
      toast.error(error.message || 'Failed to submit payment request');
      return false;
    }
  };

  const approvePaymentRequest = async (id: string, userName: string): Promise<boolean> => {
    if (!user) {
      toast.error('You must be logged in');
      return false;
    }

    try {
      const { error } = await supabase
        .from('supplier_payments')
        .update({
          payment_request_status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by: user.id,
          approved_by_name: userName,
        })
        .eq('id', id);

      if (error) throw error;

      recordProcurementAudit(
        { id: user.id, name: userName || profile?.name },
        PROCUREMENT_AUDIT_ACTIONS.PAYMENT_APPROVED,
        { payment_id: id }
      );

      toast.success('Payment request approved');
      await refetch();
      return true;
    } catch (error: any) {
      console.error('Error approving payment request:', error);
      toast.error(error.message || 'Failed to approve payment request');
      return false;
    }
  };

  const markPaymentDone = async (
    id: string,
    userName: string,
    screenshots?: File[],
    paymentDetails?: { payment_mode?: string; reference_number?: string; payment_date?: string; notes?: string }
  ): Promise<boolean> => {
    if (!user) {
      toast.error('You must be logged in');
      return false;
    }

    try {
      // First, get the payment to find linked order
      const { data: paymentData, error: fetchError } = await supabase
        .from('supplier_payments')
        .select('order_id, inventory_procurement_id')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      let screenshot_urls: string[] | null = null;
      
      if (screenshots && screenshots.length > 0) {
        screenshot_urls = await uploadScreenshots(screenshots);
      }

      const { error } = await supabase
        .from('supplier_payments')
        .update({
          payment_request_status: 'done',
          completed_at: new Date().toISOString(),
          completed_by: user.id,
          completed_by_name: userName,
          ...(screenshot_urls && { screenshot_urls }),
          ...(paymentDetails?.payment_mode && { payment_mode: paymentDetails.payment_mode }),
          ...(paymentDetails?.reference_number && { reference_number: paymentDetails.reference_number }),
          ...(paymentDetails?.payment_date && { payment_date: paymentDetails.payment_date }),
          ...(paymentDetails?.notes && { notes: paymentDetails.notes }),
        })
        .eq('id', id);

      if (error) throw error;

      // Update order status to "to_ship" when payment is done
      if (paymentData?.order_id) {
        const { error: orderError } = await supabase
          .from('orders')
          .update({ status: 'to_ship' })
          .eq('id', paymentData.order_id);

        if (orderError) {
          console.error('Error updating order status to to_ship:', orderError);
        }
      }

      // If payment is for an inventory procurement, get the linked order via order_procurement_links
      if (paymentData?.inventory_procurement_id) {
        const { data: linkData } = await supabase
          .from('order_procurement_links')
          .select('order_id')
          .eq('inventory_procurement_id', paymentData.inventory_procurement_id)
          .limit(1);

        if (linkData && linkData.length > 0) {
          const { error: orderError } = await supabase
            .from('orders')
            .update({ status: 'to_ship' })
            .eq('id', linkData[0].order_id);

          if (orderError) {
            console.error('Error updating linked order status to to_ship:', orderError);
          }
        }
      }

      recordProcurementAudit(
        { id: user.id, name: userName || profile?.name },
        PROCUREMENT_AUDIT_ACTIONS.PAYMENT_COMPLETED,
        {
          payment_id: id,
          order_id: paymentData?.order_id ?? null,
          inventory_procurement_id: paymentData?.inventory_procurement_id ?? null,
          payment_mode: paymentDetails?.payment_mode ?? null,
          reference_number: paymentDetails?.reference_number ?? null,
          payment_date: paymentDetails?.payment_date ?? null,
        }
      );

      toast.success('Payment marked as done');
      await refetch();
      return true;
    } catch (error: any) {
      console.error('Error marking payment done:', error);
      toast.error(error.message || 'Failed to mark payment done');
      return false;
    }
  };

  const rejectPaymentRequest = async (id: string): Promise<boolean> => {
    if (!user) return false;

    try {
      // Rejection is implemented as a hard delete, so capture the request first.
      const { data: existing } = await supabase
        .from('supplier_payments')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      const { error } = await supabase
        .from('supplier_payments')
        .delete()
        .eq('id', id);

      if (error) throw error;

      recordProcurementAudit(
        actor,
        PROCUREMENT_AUDIT_ACTIONS.PAYMENT_REJECTED,
        summarisePayment(existing)
      );

      toast.success('Payment request rejected');
      await refetch();
      return true;
    } catch (error: any) {
      console.error('Error rejecting payment request:', error);
      toast.error(error.message || 'Failed to reject payment request');
      return false;
    }
  };

  return {
    payments,
    loading,
    createPayment,
    deletePayment,
    uploadScreenshots,
    getSignedUrl,
    requestPayment,
    approvePaymentRequest,
    markPaymentDone,
    rejectPaymentRequest,
    refetch,
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
