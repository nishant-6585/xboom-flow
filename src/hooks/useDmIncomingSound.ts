import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationSound } from "@/hooks/useNotificationSound";

/**
 * Global listener: plays a chime whenever the current user receives a new DM.
 * Mount once (e.g. in the header) so every page hears incoming messages.
 */
export function useDmIncomingSound() {
  const { user } = useAuth();
  const uid = user?.id;
  const { playNotificationSound } = useNotificationSound();
  const lastPlayedRef = useRef<number>(0);

  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel(`dm-incoming-${uid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages" },
        (payload) => {
          const row: any = payload.new;
          if (!row || row.sender_id === uid) return;
          // Throttle to avoid stacked chimes when a burst lands
          const now = Date.now();
          if (now - lastPlayedRef.current < 800) return;
          lastPlayedRef.current = now;
          playNotificationSound("hot_lead");
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [uid, playNotificationSound]);
}