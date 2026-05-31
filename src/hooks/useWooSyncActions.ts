import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export function useWooSyncActions(opts: {
  refetchWooOrders: () => void;
  refetchWooSync: () => void;
  refetchWooNotifs: () => Promise<void> | void;
}) {
  const [wooSyncing, setWooSyncing] = useState(false);
  const [wooBulkRetrying, setWooBulkRetrying] = useState(false);

  const handleWooManualSync = async () => {
    if (wooSyncing) return;
    setWooSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-website-orders', { body: { incremental: true } });
      if (error) throw error;
      toast({ title: 'Sync triggered', description: data?.message || 'Pulling latest orders from WooCommerce…' });
      setTimeout(() => { opts.refetchWooOrders(); opts.refetchWooSync(); }, 3000);
    } catch (err: any) {
      toast({ title: 'Sync failed', description: err?.message || 'Could not start sync', variant: 'destructive' });
    } finally {
      setWooSyncing(false);
    }
  };

  const handleRetryAllFailedWhatsapp = async () => {
    if (wooBulkRetrying) return;
    setWooBulkRetrying(true);
    try {
      const ids: string[] = [];
      let from = 0;
      const PAGE = 1000;
      for (let i = 0; i < 10; i++) {
        const { data, error } = await supabase
          .from('order_notifications').select('id')
          .eq('channel', 'whatsapp').eq('status', 'failed')
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data || []).map((r) => r.id);
        ids.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      if (ids.length === 0) {
        toast({ title: 'Nothing to retry', description: 'No failed notifications.' });
        return;
      }
      let totalSent = 0, totalRetried = 0, totalFailed = 0;
      const CHUNK = 50;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const { data, error } = await supabase.functions.invoke('send-order-status-whatsapp', { body: { notification_ids: chunk } });
        if (error) throw error;
        totalSent += data?.sent ?? 0;
        totalRetried += data?.retried ?? 0;
        totalFailed += data?.failed ?? 0;
      }
      toast({
        title: 'Bulk retry complete',
        description: `${ids.length} attempted · ${totalSent} sent · ${totalRetried} re-queued · ${totalFailed} failed`,
      });
      await opts.refetchWooNotifs();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bulk retry failed';
      toast({ title: 'Bulk retry failed', description: msg, variant: 'destructive' });
    } finally {
      setWooBulkRetrying(false);
    }
  };

  return { wooSyncing, wooBulkRetrying, handleWooManualSync, handleRetryAllFailedWhatsapp };
}