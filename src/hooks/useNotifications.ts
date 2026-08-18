import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { toast } from 'sonner';
import { isEnquiryOpen } from '@/lib/enquiryPresence';

function navigateToNotification(notification: Notification) {
  if (notification.enquiry_id) {
    window.location.assign(`/?enquiry=${notification.enquiry_id}`);
    return;
  }
  if (notification.portal_ticket_id) {
    window.location.assign(`/admin/portal-tickets/${notification.portal_ticket_id}`);
    return;
  }
  if (notification.account_id) {
    window.location.assign(`/kyc?account=${notification.account_id}`);
    return;
  }
  if (notification.order_id) {
    window.location.assign(`/orders?order_id=${notification.order_id}`);
  }
}

/**
 * Portal customer-ticket notification types. These are written by the database
 * triggers in migration 20260818120000 and are the only alert supply chain
 * gets for a ticket nobody has picked up yet, so they toast and persist.
 */
const PORTAL_TICKET_TYPES = new Set([
  'portal_ticket_created',
  'portal_ticket_message',
  'portal_ticket_assigned',
  'portal_service_request',
  'portal_sla_breach',
]);

const PORTAL_TICKET_ICONS: Record<string, string> = {
  portal_ticket_created: '🎫',
  portal_ticket_message: '💬',
  portal_ticket_assigned: '📌',
  portal_service_request: '🔧',
  portal_sla_breach: '🚨',
};

/** Every notification type that raises a snackbar toast. */
const TOASTED_TYPES = new Set([
  'hot_lead',
  'mega_deal',
  'enquiry_response',
  'enquiry_message',
  'enquiry_nudge',
  ...PORTAL_TICKET_TYPES,
]);

export interface Notification {
  id: string;
  order_id: string | null;
  enquiry_id: string | null;
  account_id: string | null;
  portal_ticket_id?: string | null;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  target_role: string | null;
  order_number?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function useNotifications() {
  const { role, isApproved } = useAuth();
  const { playNotificationSound } = useNotificationSound();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const shownToastIds = useRef<Set<string>>(new Set());
  const isInitialLoad = useRef(true);

  const showToastForNotification = useCallback((notification: Notification) => {
    // Show toasts for hot leads, mega deals, enquiry threads, and portal
    // customer tickets. Portal ticket types were previously excluded, which is
    // why customer tickets and replies produced no snackbar at all.
    if (!TOASTED_TYPES.has(notification.type)) {
      return;
    }

    // Don't show toast if already shown
    if (shownToastIds.current.has(notification.id)) {
      return;
    }

    // Suppress enquiry_message toast when the user is actively viewing
    // that enquiry's detail dialog (they're reading the thread live).
    if (
      (notification.type === 'enquiry_message' || notification.type === 'enquiry_nudge') &&
      notification.enquiry_id &&
      isEnquiryOpen(notification.enquiry_id)
    ) {
      return;
    }

    // Same idea for portal tickets: don't toast a ticket the user is already
    // reading — the message is right there in the thread.
    if (
      notification.portal_ticket_id &&
      typeof window !== 'undefined' &&
      window.location.pathname.includes(notification.portal_ticket_id)
    ) {
      return;
    }

    shownToastIds.current.add(notification.id);

    const isHotLead = notification.type === 'hot_lead';
    const isEnquiryMessage =
      notification.type === 'enquiry_message' || notification.type === 'enquiry_nudge';
    const isPortalTicket = PORTAL_TICKET_TYPES.has(notification.type);

    // Play sound alert
    playNotificationSound(
      isPortalTicket ? 'ticket' : isHotLead ? 'hot_lead' : 'mega_deal',
    );

    const icon = PORTAL_TICKET_ICONS[notification.type]
      ?? (isHotLead
        ? '🔥'
        : notification.type === 'enquiry_response'
        ? '📋'
        : notification.type === 'enquiry_nudge'
        ? '👋'
        : notification.type === 'enquiry_message'
        ? '💬'
        : '🌟');

    // Anything that needs a human to act — an unanswered customer thread or a
    // breached ticket — stays on screen until it is dismissed. Everything else
    // keeps the default 8s auto-dismiss.
    const persist = isEnquiryMessage || isPortalTicket;

    toast(notification.title, {
      description: notification.order_number
        ? `Order #${notification.order_number} — ${notification.message}`
        : notification.message,
      duration: persist ? Infinity : 8000,
      closeButton: persist ? true : undefined,
      icon,
      action: {
        label: 'View',
        onClick: () => {
          markAsRead(notification.id);
          navigateToNotification(notification);
        },
      },
    });
  }, [playNotificationSound]);

  const fetchNotifications = useCallback(async () => {
    if (!isApproved) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*, orders(order_number)')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const notifs = ((data || []) as any[]).map((n) => ({
        ...n,
        order_number: n.orders?.order_number ?? null,
      })) as Notification[];
      // Dedup by id defensively — realtime may have already inserted some rows
      const uniq = Array.from(new Map(notifs.map(n => [n.id, n])).values());
      setNotifications(uniq);
      setUnreadCount(uniq.filter(n => !n.is_read).length);
      
      // Mark initial load as complete
      isInitialLoad.current = false;
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [isApproved]);

  useEffect(() => {
    fetchNotifications();

    // Subscribe to realtime updates — unique channel name per mount so
    // remounts/StrictMode don't collide on the same global channel.
    const channelName = `notifications-changes-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
        },
        async (payload) => {
          const newNotification = payload.new as Notification;

          // Enrich with order_number if linked to an order
          if (newNotification.order_id && !newNotification.order_number) {
            try {
              const { data: ord } = await supabase
                .from('orders')
                .select('order_number')
                .eq('id', newNotification.order_id)
                .maybeSingle();
              if (ord?.order_number) newNotification.order_number = ord.order_number;
            } catch {
              // best-effort enrichment
            }
          }

          // Dedup by id — prevents the same row from stacking up if
          // the INSERT event is delivered more than once (multiple
          // subscribers, reconnects, or an overlap with a refetch).
          let inserted = false;
          setNotifications(prev => {
            if (prev.some(n => n.id === newNotification.id)) return prev;
            inserted = true;
            return [newNotification, ...prev];
          });
          if (inserted && !newNotification.is_read) {
            setUnreadCount(prev => prev + 1);
          }
          
          // Show toast for new hot leads and mega deals (skip on initial load)
          if (inserted && !isInitialLoad.current) {
            showToastForNotification(newNotification);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchNotifications, showToastForNotification]);

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('is_read', false);

      if (error) throw error;

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const markTicketNotificationsAsRead = useCallback(async (ticketId: string) => {
    if (!ticketId) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('portal_ticket_id', ticketId)
        .eq('is_read', false);
      if (error) throw error;
      setNotifications(prev => {
        let cleared = 0;
        const next = prev.map(n => {
          if (n.portal_ticket_id === ticketId && !n.is_read) {
            cleared += 1;
            return { ...n, is_read: true };
          }
          return n;
        });
        if (cleared > 0) setUnreadCount(c => Math.max(0, c - cleared));
        return next;
      });
    } catch (error) {
      console.error('Error marking ticket notifications as read:', error);
    }
  }, []);

  const generatePaymentReminders = async () => {
    try {
      const { error } = await supabase.rpc('generate_payment_reminders');
      if (error) throw error;
      await fetchNotifications();
      return true;
    } catch (error) {
      console.error('Error generating payment reminders:', error);
      return false;
    }
  };

  return {
    notifications,
    loading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    markTicketNotificationsAsRead,
    generatePaymentReminders,
    refetch: fetchNotifications,
  };
}
