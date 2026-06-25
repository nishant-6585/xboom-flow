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

  // Prime the AudioContext on the first user gesture so later programmatic
  // playback (triggered by an incoming realtime event) is allowed by the
  // browser autoplay policy.
  useEffect(() => {
    const prime = () => {
      try {
        const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
        if (!Ctx) return;
        const ctx = new Ctx();
        ctx.resume().catch(() => {});
        // Play a silent buffer to fully unlock on iOS/Safari
        const buffer = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        src.start(0);
      } catch {}
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
    window.addEventListener("pointerdown", prime, { once: true });
    window.addEventListener("keydown", prime, { once: true });
    return () => {
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
  }, []);

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
          // eslint-disable-next-line no-console
          console.log("[DM] incoming message — playing chime", row.id);
          void playNotificationSound("hot_lead");
        }
      )
      .subscribe((status) => {
        // eslint-disable-next-line no-console
        console.log("[DM] incoming-sound channel status:", status);
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [uid, playNotificationSound]);
}