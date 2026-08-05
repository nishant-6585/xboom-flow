import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { sendSlackNotification } from '@/hooks/useSlackSettings';

export type PipelineStatus = 'pending_confirmation' | 'won' | 'lost' | 'negotiation' | 'follow_up';
export type LeadTemperature = 'hot' | 'warm' | 'cold';

export const PIPELINE_LOST_REASONS = [
  { value: 'pricing', label: 'Pricing too high' },
  { value: 'timeline', label: 'Timeline not acceptable' },
  { value: 'competition', label: 'Lost to competition' },
  { value: 'budget', label: 'Customer budget constraints' },
  { value: 'specifications', label: 'Product specifications mismatch' },
  { value: 'no_response', label: 'Customer not responding' },
  { value: 'other', label: 'Other' },
] as const;

export type PipelineLostReason = typeof PIPELINE_LOST_REASONS[number]['value'];

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
  lost_reason: string | null;
  lost_reason_notes: string | null;
  customer_type: 'b2b' | 'b2c';
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
  customer_type?: 'b2b' | 'b2c';
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
  // Depend on user.id (a stable primitive), NOT the user OBJECT. Supabase
  // re-issues a fresh user object on tab focus / session refresh; using the
  // object as a dep would flip loading back to true, unmounting any open
  // dialogs and wiping in-progress form data (see usePricelist.ts for the
  // original occurrence of this bug).
  const userId = user?.id ?? null;
  const [pipelineOrders, setPipelineOrders] = useState<PipelineOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPipelineOrders = useCallback(async () => {
    if (!userId) return;

    try {
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
      // Only flip loading off — never back on for background refetches.
      // The initial `useState(true)` covers first load.
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchPipelineOrders();
  }, [fetchPipelineOrders]);

  useEffect(() => {
    const channel = supabase
      .channel(`pipeline-orders-changes-${crypto.randomUUID()}`)
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

      // Send Slack notification for new pipeline
      sendSlackNotification('new_pipeline', {
        customer_name: formData.customer_name,
        customer_company: formData.customer_company,
        product_name: formData.product_name,
        product_category: formData.product_category,
        quantity: formData.quantity,
        expected_price: formData.expected_price,
        expected_closure_date: formData.expected_closure_date,
        probability: formData.probability,
        lead_temperature: formData.lead_temperature || 'warm',
        is_mega_deal: formData.is_mega_deal || false,
        sales_person_name: formData.sales_person_name,
        status: formData.status || 'pending_confirmation',
      }).catch(err => console.error('Slack notification failed:', err));

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
