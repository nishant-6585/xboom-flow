import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns the set of woo_order_ids that currently have at least one
 * failed / pending WhatsApp notification, plus a count of failed rows.
 * Used by the Orders page to power the "Failed WhatsApp" / "Pending
 * notifications" filter chips and the "Retry all failed" bulk action.
 */
export function useNotificationOrderSets() {
  const [failedOrderIds, setFailedOrderIds] = useState<Set<string>>(new Set());
  const [pendingOrderIds, setPendingOrderIds] = useState<Set<string>>(new Set());
  const [failedCount, setFailedCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    const [failed, pending] = await Promise.all([
      supabase
        .from('order_notifications')
        .select('woo_order_id, id', { count: 'exact' })
        .eq('channel', 'whatsapp')
        .eq('status', 'failed')
        .limit(2000),
      supabase
        .from('order_notifications')
        .select('woo_order_id, id', { count: 'exact' })
        .eq('channel', 'whatsapp')
        .eq('status', 'pending')
        .limit(2000),
    ]);
    if (!failed.error) {
      setFailedOrderIds(new Set((failed.data || []).map((r) => r.woo_order_id)));
      setFailedCount(failed.count ?? failed.data?.length ?? 0);
    }
    if (!pending.error) {
      setPendingOrderIds(new Set((pending.data || []).map((r) => r.woo_order_id)));
      setPendingCount(pending.count ?? pending.data?.length ?? 0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return {
    failedOrderIds,
    pendingOrderIds,
    failedCount,
    pendingCount,
    loading,
    refetch,
  };
}