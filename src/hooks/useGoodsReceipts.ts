import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { recordProcurementAudit, PROCUREMENT_AUDIT_ACTIONS } from '@/lib/procurementAudit';

/**
 * `goods_receipts`, `goods_receipt_items` and `import_three_way_match` are new in
 * migration 20260821094000 and are not yet in the generated Supabase types.
 * Follows the existing convention in this codebase for not-yet-generated objects
 * (see useManychatLeads, usePortalTicketAssignees).
 *
 * TODO: drop this alias after running `supabase gen types typescript`.
 */
const db = supabase as any;

export type GoodsReceiptStatus = 'draft' | 'posted' | 'cancelled';

export interface GoodsReceiptItem {
  id?: string;
  goods_receipt_id?: string;
  import_item_id?: string | null;
  product_name: string;
  product_code: string | null;
  hsn_code: string | null;
  quantity_ordered: number;
  quantity_received: number;
  quantity_accepted: number;
  /** Generated in Postgres: received - accepted. Read-only. */
  quantity_rejected?: number;
  rejection_reason: string | null;
  unit_price: number | null;
}

export interface GoodsReceipt {
  id: string;
  grn_number: string | null;
  import_id: string | null;
  order_id: string | null;
  inventory_procurement_id: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  received_date: string;
  status: GoodsReceiptStatus;
  posted_at: string | null;
  posted_by: string | null;
  posted_by_name: string | null;
  inspection_notes: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  created_by_name: string | null;
  items?: GoodsReceiptItem[];
}

/** One row of the three-way match view, per import. */
export interface ThreeWayMatch {
  import_id: string;
  import_number: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  currency: string;
  base_currency: string;
  status: string;
  quantity_ordered: number | null;
  ordered_value: number | null;
  total_landed_cost: number | null;
  quantity_received: number;
  quantity_accepted: number;
  quantity_rejected: number;
  last_received_date: string | null;
  receipt_count: number;
  amount_paid: number;
  accepted_value: number;
  overpayment_exposure: number;
  match_status:
    | 'matched'
    | 'awaiting_receipt'
    | 'paid_not_received'
    | 'short_received'
    | 'rejected_quantity'
    | 'overpaid'
    | 'underpaid';
}

export const MATCH_STATUS_LABELS: Record<ThreeWayMatch['match_status'], string> = {
  matched: 'Matched',
  awaiting_receipt: 'Awaiting receipt',
  paid_not_received: 'Paid, not received',
  short_received: 'Short received',
  rejected_quantity: 'Quantity rejected',
  overpaid: 'Overpaid',
  underpaid: 'Underpaid',
};

/** Which mismatches warrant blocking or chasing, versus merely informational. */
export const MATCH_STATUS_SEVERITY: Record<ThreeWayMatch['match_status'], 'ok' | 'warn' | 'alert'> = {
  matched: 'ok',
  awaiting_receipt: 'warn',
  underpaid: 'warn',
  short_received: 'warn',
  rejected_quantity: 'alert',
  overpaid: 'alert',
  paid_not_received: 'alert',
};

export function useGoodsReceipts(importId?: string) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const actor = { id: user?.id, name: profile?.name };

  const fetchReceipts = useCallback(async (): Promise<GoodsReceipt[]> => {
    let query = db.from('goods_receipts')
      .select('*, items:goods_receipt_items(*)')
      .order('created_at', { ascending: false });

    if (importId) query = query.eq('import_id', importId);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching goods receipts:', error);
      toast.error('Failed to load goods receipts');
      return [];
    }
    return (data ?? []) as unknown as GoodsReceipt[];
  }, [importId]);

  const receiptsQuery = useQuery({
    queryKey: ['goods_receipts', importId ?? 'all'],
    queryFn: fetchReceipts,
    staleTime: 5 * 60 * 1000,
  });

  const matchQuery = useQuery({
    queryKey: ['import_three_way_match'],
    queryFn: async (): Promise<ThreeWayMatch[]> => {
      const { data, error } = await db
        .from('import_three_way_match')
        .select('*')
        .order('import_number', { ascending: false });

      if (error) {
        console.error('Error fetching three-way match:', error);
        return [];
      }
      return (data ?? []) as unknown as ThreeWayMatch[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['goods_receipts'] });
    queryClient.invalidateQueries({ queryKey: ['import_three_way_match'] });
  }, [queryClient]);

  const createReceipt = async (
    receipt: Partial<GoodsReceipt>,
    items: GoodsReceiptItem[]
  ): Promise<GoodsReceipt | null> => {
    if (!user) {
      toast.error('You must be logged in');
      return null;
    }

    try {
      const { data, error } = await db.from('goods_receipts')
        .insert({
          import_id: receipt.import_id ?? null,
          order_id: receipt.order_id ?? null,
          inventory_procurement_id: receipt.inventory_procurement_id ?? null,
          supplier_id: receipt.supplier_id ?? null,
          supplier_name: receipt.supplier_name ?? null,
          received_date: receipt.received_date ?? new Date().toISOString().slice(0, 10),
          inspection_notes: receipt.inspection_notes ?? null,
          notes: receipt.notes ?? null,
          // Always created as a draft. Posting is a separate, deliberate act.
          status: 'draft',
          created_by: user.id,
          created_by_name: profile?.name ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      if (items.length > 0) {
        const { error: itemsError } = await db.from('goods_receipt_items').insert(
          items.map(item => ({
            goods_receipt_id: data.id,
            import_item_id: item.import_item_id ?? null,
            product_name: item.product_name,
            product_code: item.product_code ?? null,
            hsn_code: item.hsn_code ?? null,
            quantity_ordered: item.quantity_ordered,
            quantity_received: item.quantity_received,
            quantity_accepted: item.quantity_accepted,
            rejection_reason: item.rejection_reason ?? null,
            unit_price: item.unit_price ?? null,
          }))
        );
        if (itemsError) throw itemsError;
      }

      toast.success('Goods receipt created as draft');
      invalidate();
      return data as unknown as GoodsReceipt;
    } catch (error: any) {
      console.error('Error creating goods receipt:', error);
      toast.error(error.message || 'Failed to create goods receipt');
      return null;
    }
  };

  /**
   * Post a receipt. This is the point at which it becomes evidence for the
   * three-way match, and after which it is immutable.
   */
  const postReceipt = async (id: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { data, error } = await db.from('goods_receipts')
        .update({
          status: 'posted',
          posted_at: new Date().toISOString(),
          posted_by: user.id,
          posted_by_name: profile?.name ?? null,
        })
        .eq('id', id)
        .eq('status', 'draft')
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        toast.error('This receipt is no longer a draft');
        return false;
      }

      recordProcurementAudit(actor, PROCUREMENT_AUDIT_ACTIONS.GRN_POSTED, {
        goods_receipt_id: id,
        grn_number: data.grn_number,
        import_id: data.import_id,
        supplier_id: data.supplier_id,
      });

      toast.success(`${data.grn_number} posted`);
      invalidate();
      return true;
    } catch (error: any) {
      console.error('Error posting goods receipt:', error);
      toast.error(error.message || 'Failed to post goods receipt');
      return false;
    }
  };

  const cancelReceipt = async (id: string, reason?: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { data, error } = await db.from('goods_receipts')
        .update({
          status: 'cancelled',
          inspection_notes: reason ?? null,
        })
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) throw error;

      recordProcurementAudit(actor, PROCUREMENT_AUDIT_ACTIONS.GRN_CANCELLED, {
        goods_receipt_id: id,
        grn_number: data?.grn_number ?? null,
        reason: reason ?? null,
      });

      toast.success('Goods receipt cancelled');
      invalidate();
      return true;
    } catch (error: any) {
      console.error('Error cancelling goods receipt:', error);
      toast.error(error.message || 'Failed to cancel goods receipt');
      return false;
    }
  };

  return {
    receipts: receiptsQuery.data ?? [],
    loading: receiptsQuery.isLoading,
    matches: matchQuery.data ?? [],
    matchesLoading: matchQuery.isLoading,
    createReceipt,
    postReceipt,
    cancelReceipt,
    refetch: invalidate,
  };
}
