import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export type NotificationStatus = 'pending' | 'sent' | 'failed';

export interface OrderNotification {
  id: string;
  woo_order_id: string;
  status_trigger: string;
  channel: string;
  status: NotificationStatus;
  retry_count: number;
  last_attempt_at: string | null;
  next_attempt_at: string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
  provider?: string | null;
  provider_message_id?: string | null;
}

/**
 * Returns the LATEST WhatsApp notification for a given WooCommerce order,
 * subscribing to realtime updates so the card reflects worker progress.
 */
export function useLatestWhatsappNotification(wooOrderId: string | null | undefined) {
  const [notification, setNotification] = useState<OrderNotification | null>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const fetchLatest = useCallback(async () => {
    if (!wooOrderId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('order_notifications')
      .select(
        'id, woo_order_id, status_trigger, channel, status, retry_count, last_attempt_at, next_attempt_at, sent_at, error_message, created_at',
      )
      .eq('woo_order_id', wooOrderId)
      .eq('channel', 'whatsapp')
      .order('created_at', { ascending: false })
      .limit(1);
    if (!error) {
      setNotification(((data || [])[0] as OrderNotification) || null);
    }
    setLoading(false);
  }, [wooOrderId]);

  useEffect(() => {
    fetchLatest();
  }, [fetchLatest]);

  const retry = useCallback(async () => {
    if (!notification) return;
    setRetrying(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'send-order-status-whatsapp',
        { body: { notification_id: notification.id } },
      );
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || 'Retry failed');
      toast({ title: 'WhatsApp retry queued', description: `Order #${notification.woo_order_id}` });
      // Refetch to reflect the new state
      await fetchLatest();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Retry failed';
      toast({ title: 'Retry failed', description: msg, variant: 'destructive' });
    } finally {
      setRetrying(false);
    }
  }, [notification, fetchLatest]);

  return { notification, loading, retrying, retry, refetch: fetchLatest };
}

/**
 * Fetch the full notification timeline for a single order. Used in the order
 * detail dialog. Each row also exposes a per-row retry action.
 */
export function useOrderNotificationTimeline(
  wooOrderId: string | null | undefined,
  enabled: boolean,
) {
  const [items, setItems] = useState<OrderNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!wooOrderId || !enabled) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('order_notifications')
      .select(
        'id, woo_order_id, status_trigger, channel, status, retry_count, last_attempt_at, next_attempt_at, sent_at, error_message, created_at, provider, provider_message_id',
      )
      .eq('woo_order_id', wooOrderId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error) {
      setItems((data || []) as OrderNotification[]);
    }
    setLoading(false);
  }, [wooOrderId, enabled]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const retryOne = useCallback(
    async (id: string) => {
      setRetryingId(id);
      try {
        const { data, error } = await supabase.functions.invoke(
          'send-order-status-whatsapp',
          { body: { notification_id: id } },
        );
        if (error) throw error;
        if (data && data.success === false) throw new Error(data.error || 'Retry failed');
        toast({ title: 'WhatsApp retry queued' });
        await fetchAll();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Retry failed';
        toast({ title: 'Retry failed', description: msg, variant: 'destructive' });
      } finally {
        setRetryingId(null);
      }
    },
    [fetchAll],
  );

  return { items, loading, retryingId, retryOne, refetch: fetchAll };
}