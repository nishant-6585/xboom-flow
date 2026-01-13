import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface ProcurementPaymentRequest {
  id: string;
  order_id: string;
  requested_by: string;
  requested_by_name: string;
  request_notes: string | null;
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProcurementPaymentRequestWithOrder extends ProcurementPaymentRequest {
  order?: {
    order_number: string | null;
    product_name: string;
    customer_name: string;
    customer_company: string;
    supplier_name: string | null;
  };
}

export function useProcurementPaymentRequests(orderId?: string) {
  const { user, profile } = useAuth();
  const [requests, setRequests] = useState<ProcurementPaymentRequestWithOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('procurement_payment_requests')
        .select(`
          *,
          order:orders(order_number, product_name, customer_name, customer_company, supplier_name)
        `)
        .order('created_at', { ascending: false });

      if (orderId) {
        query = query.eq('order_id', orderId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setRequests((data as any[]) || []);
    } catch (error: any) {
      console.error('Error fetching payment requests:', error);
      toast.error('Failed to load payment requests');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const createRequest = async (orderId: string, notes?: string) => {
    if (!user || !profile) {
      toast.error('You must be logged in to create a request');
      return false;
    }

    try {
      const { error } = await supabase
        .from('procurement_payment_requests')
        .insert({
          order_id: orderId,
          requested_by: user.id,
          requested_by_name: profile.name,
          request_notes: notes || null,
        });

      if (error) throw error;

      toast.success('Payment status request submitted');
      await fetchRequests();
      return true;
    } catch (error: any) {
      console.error('Error creating payment request:', error);
      toast.error(error.message || 'Failed to submit request');
      return false;
    }
  };

  const approveRequest = async (requestId: string) => {
    if (!user || !profile) {
      toast.error('You must be logged in');
      return false;
    }

    try {
      const { error } = await supabase
        .from('procurement_payment_requests')
        .update({
          status: 'approved',
          approved_by: user.id,
          approved_by_name: profile.name,
          approved_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (error) throw error;

      toast.success('Request approved');
      await fetchRequests();
      return true;
    } catch (error: any) {
      console.error('Error approving request:', error);
      toast.error(error.message || 'Failed to approve request');
      return false;
    }
  };

  const rejectRequest = async (requestId: string, reason: string) => {
    if (!user || !profile) {
      toast.error('You must be logged in');
      return false;
    }

    try {
      const { error } = await supabase
        .from('procurement_payment_requests')
        .update({
          status: 'rejected',
          approved_by: user.id,
          approved_by_name: profile.name,
          approved_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq('id', requestId);

      if (error) throw error;

      toast.success('Request rejected');
      await fetchRequests();
      return true;
    } catch (error: any) {
      console.error('Error rejecting request:', error);
      toast.error(error.message || 'Failed to reject request');
      return false;
    }
  };

  const deleteRequest = async (requestId: string) => {
    try {
      const { error } = await supabase
        .from('procurement_payment_requests')
        .delete()
        .eq('id', requestId);

      if (error) throw error;

      toast.success('Request deleted');
      await fetchRequests();
      return true;
    } catch (error: any) {
      console.error('Error deleting request:', error);
      toast.error(error.message || 'Failed to delete request');
      return false;
    }
  };

  const getPendingCount = () => requests.filter(r => r.status === 'pending').length;

  return {
    requests,
    loading,
    refetch: fetchRequests,
    createRequest,
    approveRequest,
    rejectRequest,
    deleteRequest,
    getPendingCount,
  };
}
