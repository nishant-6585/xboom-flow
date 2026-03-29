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
          setTimeout(async () => {
            try {
              const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                  },
                  body: JSON.stringify({ text: message }),
                }
              );

              if (!response.ok) {
                throw new Error(`TTS request failed: ${response.status}`);
              }

              const audioBlob = await response.blob();
              const audioUrl = URL.createObjectURL(audioBlob);
              const audio = new Audio(audioUrl);
              audio.volume = 0.8;
              await audio.play();

              // Clean up blob URL after playback
              audio.addEventListener("ended", () => {
                URL.revokeObjectURL(audioUrl);
              });
            } catch (error) {
              console.warn("ElevenLabs TTS failed, falling back to browser speech:", error);
              // Fallback to browser speech synthesis
              if ("speechSynthesis" in window) {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(message);
                utterance.rate = 1;
                utterance.pitch = 1;
                utterance.volume = 0.8;
                const voices = window.speechSynthesis.getVoices();
                const preferred = voices.find(
                  (v) =>
                    v.lang.startsWith("en") &&
                    (v.name.includes("Google") || v.name.includes("Samantha") || v.name.includes("Daniel"))
                ) || voices.find((v) => v.lang.startsWith("en"));
                if (preferred) utterance.voice = preferred;
                window.speechSynthesis.speak(utterance);
              }
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
