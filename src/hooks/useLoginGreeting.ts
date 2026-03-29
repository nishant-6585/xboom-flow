import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useLoginGreeting() {
  const hasGreetedRef = useRef(false);
  const { user, mfaStatus, profile } = useAuth();

  useEffect(() => {
    // Only greet after MFA is verified (or not required) and user is logged in
    const shouldGreet =
      user &&
      profile &&
      !hasGreetedRef.current &&
      (mfaStatus === "verified" || mfaStatus === "not_required");

    if (!shouldGreet) return;

    hasGreetedRef.current = true;

    const name = profile.name?.split(" ")[0] || "there";
    const hour = new Date().getHours();
    let timeGreeting = "Good day";
    if (hour < 12) timeGreeting = "Good morning";
    else if (hour < 17) timeGreeting = "Good afternoon";
    else timeGreeting = "Good evening";

    const message = `${timeGreeting}, ${name}! Welcome to Xboom Flow.`;

    // Small delay to let the UI settle
    setTimeout(async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;
        console.log("[Greeting] Calling ElevenLabs TTS...");
        
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text: message }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("[Greeting] ElevenLabs TTS failed:", response.status, errorText);
          throw new Error(`TTS request failed: ${response.status}`);
        }

        console.log("[Greeting] ElevenLabs TTS success, playing audio...");
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.volume = 0.8;
        await audio.play();

        audio.addEventListener("ended", () => {
          URL.revokeObjectURL(audioUrl);
        });
      } catch (error) {
        console.warn("[Greeting] ElevenLabs TTS failed, falling back to browser speech:", error);
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
    }, 1000);
  }, [user, mfaStatus, profile]);

  // Reset when user signs out
  useEffect(() => {
    if (!user) {
      hasGreetedRef.current = false;
    }
  }, [user]);
}
