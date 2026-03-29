import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useLoginGreeting() {
  const hasGreetedRef = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" && session?.user && !hasGreetedRef.current) {
          hasGreetedRef.current = true;

          // Fetch profile name
          const { data: profile } = await supabase
            .from("profiles")
            .select("name")
            .eq("user_id", session.user.id)
            .single();

          const name = profile?.name?.split(" ")[0] || "there";
          const hour = new Date().getHours();
          let timeGreeting = "Good day";
          if (hour < 12) timeGreeting = "Good morning";
          else if (hour < 17) timeGreeting = "Good afternoon";
          else timeGreeting = "Good evening";

          const message = `${timeGreeting}, ${name}! Welcome to Xboom Flow.`;

          // Small delay to let the UI settle
          setTimeout(() => {
            if ("speechSynthesis" in window) {
              // Cancel any pending speech
              window.speechSynthesis.cancel();

              const utterance = new SpeechSynthesisUtterance(message);
              utterance.rate = 1;
              utterance.pitch = 1;
              utterance.volume = 0.8;

              // Try to pick a good English voice
              const voices = window.speechSynthesis.getVoices();
              const preferred = voices.find(
                (v) =>
                  v.lang.startsWith("en") &&
                  (v.name.includes("Google") || v.name.includes("Samantha") || v.name.includes("Daniel"))
              ) || voices.find((v) => v.lang.startsWith("en"));

              if (preferred) utterance.voice = preferred;

              window.speechSynthesis.speak(utterance);
            }
          }, 800);
        }

        if (event === "SIGNED_OUT") {
          hasGreetedRef.current = false;
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);
}
