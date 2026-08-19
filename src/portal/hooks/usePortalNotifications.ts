import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PortalNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  portal_ticket_id: string | null;
  order_id: string | null;
  is_read: boolean;
  created_at: string;
}

/**
 * Customer-facing notification feed for the portal.
 *
 * Reads public.portal_notifications, which is deliberately separate from the
 * staff `notifications` table — that one grants visibility by internal role,
 * so exposing it to customers would risk leaking internal alerts.
 *
 * Subscribes to realtime INSERTs so a staff reply appears without a refresh.
 */
export function usePortalNotifications() {
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ["portal", "notifications"],
    queryFn: async (): Promise<PortalNotification[]> => {
      const { data, error } = await (supabase as any)
        .from("portal_notifications")
        .select("id, type, title, message, portal_ticket_id, order_id, is_read, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as PortalNotification[];
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    // Unique channel name per mount so remounts/StrictMode don't collide.
    const name = `portal-notifications-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(name)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "portal_notifications" },
        () => qc.invalidateQueries({ queryKey: ["portal", "notifications"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const unreadCount = data.filter((n) => !n.is_read).length;

  const markRead = useMutation({
    // Passing null marks everything on the account read — the RPC scopes to the
    // caller's own account, so a contact can never touch another company's rows.
    mutationFn: async (ids: string[] | null) => {
      const { error } = await (supabase as any).rpc("mark_portal_notifications_read", {
        _ids: ids,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal", "notifications"] }),
  });

  return { notifications: data, unreadCount, isLoading, markRead };
}
