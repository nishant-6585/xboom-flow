import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type PipelineStatus = 'pending_confirmation' | 'won' | 'lost' | 'negotiation' | 'follow_up';
export type LeadTemperature = 'hot' | 'warm' | 'cold';

export interface PipelineOrder {
  id: string;
  customer_name: string;
  customer_company: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_notes: string | null;
  product_name: string;
  product_category: string | null;
  product_code: string | null;
  quantity: number;
  expected_price: number | null;
  expected_closure_date: string | null;
  status: PipelineStatus;
  sales_person_id: string;
  sales_person_name: string;
  lead_source: string | null;
  priority: number | null;
  probability: number | null;
  internal_notes: string | null;
  lead_temperature: LeadTemperature;
  is_mega_deal: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
  enquiry_id: string | null;
}

export interface PipelineOrderFormData {
  customer_name: string;
  customer_company: string;
  customer_email?: string;
  customer_phone?: string;
  customer_notes?: string;
  product_name: string;
  product_category?: string;
  product_code?: string;
  quantity: number;
  expected_price?: number;
  expected_closure_date?: string;
  status?: PipelineStatus;
  sales_person_id: string;
  sales_person_name: string;
  lead_source?: string;
  priority?: number;
  probability?: number;
  internal_notes?: string;
  lead_temperature?: LeadTemperature;
  is_mega_deal?: boolean;
}

export const PIPELINE_STATUSES = [
  { value: 'pending_confirmation', label: 'Pending Confirmation' },
  { value: 'negotiation', label: 'In Negotiation' },
  { value: 'follow_up', label: 'Follow Up Required' },
  { value: 'won', label: 'Order Won' },
  { value: 'lost', label: 'Order Lost' },
] as const;

export const PIPELINE_PRIORITIES = [
  { value: 1, label: 'High' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'Low' },
] as const;

export function usePipelineOrders() {
  const { user, role } = useAuth();
  const [pipelineOrders, setPipelineOrders] = useState<PipelineOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPipelineOrders = useCallback(async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('pipeline_orders')
        .select('*')
        .order('expected_closure_date', { ascending: true, nullsFirst: false });

      if (error) throw error;
      setPipelineOrders((data as PipelineOrder[]) || []);
    } catch (error: any) {
      console.error('Error fetching pipeline orders:', error);
      toast.error('Failed to fetch pipeline orders');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPipelineOrders();
  }, [fetchPipelineOrders]);

  useEffect(() => {
    const channel = supabase
      .channel('pipeline_orders_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pipeline_orders' },
        () => {
          fetchPipelineOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPipelineOrders]);

  const createPipelineOrder = async (formData: PipelineOrderFormData): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase.from('pipeline_orders').insert({
        ...formData,
        created_by: user.id,
      });

      if (error) throw error;
      toast.success('Pipeline order created successfully');
      return true;
    } catch (error: any) {
      console.error('Error creating pipeline order:', error);
      toast.error(error.message || 'Failed to create pipeline order');
      return false;
    }
  };

  const updatePipelineOrder = async (id: string, updates: Partial<PipelineOrder>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('pipeline_orders')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      toast.success('Pipeline order updated successfully');
      return true;
    } catch (error: any) {
      console.error('Error updating pipeline order:', error);
      toast.error(error.message || 'Failed to update pipeline order');
      return false;
    }
  };

  const deletePipelineOrder = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('pipeline_orders')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Pipeline order deleted successfully');
      return true;
    } catch (error: any) {
      console.error('Error deleting pipeline order:', error);
      toast.error(error.message || 'Failed to delete pipeline order');
      return false;
    }
  };

  return {
    pipelineOrders,
    loading,
    createPipelineOrder,
    updatePipelineOrder,
    deletePipelineOrder,
    refetch: fetchPipelineOrders,
  };
}
