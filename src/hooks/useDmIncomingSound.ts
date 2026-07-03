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
  const { playNotificationSound, primeAudio } = useNotificationSound();
  const lastPlayedRef = useRef<number>(0);

  useEffect(() => {
    const handler = () => {
      void primeAudio();
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
      window.removeEventListener("click", handler);
    };
    window.addEventListener("pointerdown", handler, { once: true });
    window.addEventListener("keydown", handler, { once: true });
    window.addEventListener("click", handler, { once: true });
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
      window.removeEventListener("click", handler);
    };
  }, [primeAudio]);

  useEffect(() => {
    if (!uid) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const handleInsert = (payload: any) => {
      const row = payload?.new;
      if (!row || row.sender_id === uid) return;
      const now = Date.now();
      if (now - lastPlayedRef.current < 800) return;
      lastPlayedRef.current = now;
      // eslint-disable-next-line no-console
      console.log("[DM] incoming message — playing chime", row.id);
      void playNotificationSound("hot_lead");
    };

    const connect = () => {
      if (cancelled) return;
      channel = supabase
        .channel(`dm-incoming-${uid}-${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "dm_messages" },
          handleInsert
        )
        .subscribe((status) => {
          // eslint-disable-next-line no-console
          console.log("[DM] incoming-sound channel status:", status);
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            if (cancelled) return;
            const staleChannel = channel;
            channel = null;
            if (staleChannel) void supabase.removeChannel(staleChannel);
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = setTimeout(connect, 2000);
          }
          if (status === "CLOSED" && !cancelled) {
            channel = null;
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = setTimeout(connect, 2000);
          }
        });
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [uid, playNotificationSound]);
}