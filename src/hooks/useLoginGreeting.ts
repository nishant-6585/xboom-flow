import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useLoginGreeting() {
  const hasGreetedRef = useRef(false);
  const prevMfaStatusRef = useRef<string | null>(null);
  const { user, mfaStatus, profile } = useAuth();

  useEffect(() => {
    // Detect transition into verified state (fresh MFA completion)
    const justVerified =
      prevMfaStatusRef.current !== null &&
      prevMfaStatusRef.current !== "verified" &&
      prevMfaStatusRef.current !== "not_required" &&
      (mfaStatus === "verified" || mfaStatus === "not_required");

    // Also greet on fresh login (user appears while mfa is already good)
    const freshLogin =
      prevMfaStatusRef.current === null &&
      user &&
      profile &&
      (mfaStatus === "verified" || mfaStatus === "not_required");

    // Track previous status
    prevMfaStatusRef.current = mfaStatus;

    const shouldGreet = user && profile && !hasGreetedRef.current && (justVerified || freshLogin);

    if (!shouldGreet) return;

    // Check sessionStorage to avoid greeting on page refresh
    const greetKey = `greeted_${user.id}`;
    if (sessionStorage.getItem(greetKey)) {
      hasGreetedRef.current = true;
      return;
    }

    hasGreetedRef.current = true;
    sessionStorage.setItem(greetKey, "1");

    const name = profile.name?.split(" ")[0] || "there";
    const hour = new Date().getHours();
    let timeGreeting = "Good day";
    if (hour < 12) timeGreeting = "Good morning";
    else if (hour < 17) timeGreeting = "Good afternoon";
    else timeGreeting = "Good evening";

    const message = `${timeGreeting}, ${name}! Welcome to Xboom Flow.`;

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

        console.log("[Greeting] ElevenLabs audio received, playing...");
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.volume = 0.8;
        await audio.play();

        audio.addEventListener("ended", () => {
          URL.revokeObjectURL(audioUrl);
        });
      } catch (error) {
        console.warn("[Greeting] ElevenLabs failed, falling back to browser speech:", error);
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
      prevMfaStatusRef.current = null;
    }
  }, [user]);
}
