import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { toast } from 'sonner';

export interface Notification {
  id: string;
  order_id: string | null;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  target_role: string | null;
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
    // Only show toasts for hot leads and mega deals
    if (notification.type !== 'hot_lead' && notification.type !== 'mega_deal') {
      return;
    }

    // Don't show toast if already shown
    if (shownToastIds.current.has(notification.id)) {
      return;
    }

    shownToastIds.current.add(notification.id);

    const isHotLead = notification.type === 'hot_lead';
    
    // Play sound alert
    playNotificationSound(isHotLead ? 'hot_lead' : 'mega_deal');
    
    toast(notification.title, {
      description: notification.message,
      duration: 8000,
      icon: isHotLead ? '🔥' : '🌟',
      action: {
        label: 'View',
        onClick: () => {
          // Mark as read when clicked
          markAsRead(notification.id);
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
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const notifs = (data || []) as Notification[];
      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.is_read).length);
      
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

    // Subscribe to realtime updates
    const channel = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          
          // Add to state
          setNotifications(prev => [newNotification, ...prev]);
          if (!newNotification.is_read) {
            setUnreadCount(prev => prev + 1);
          }
          
          // Show toast for new hot leads and mega deals (skip on initial load)
          if (!isInitialLoad.current) {
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
    generatePaymentReminders,
    refetch: fetchNotifications,
  };
}
