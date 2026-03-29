import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";

const PENDING_GREETING_KEY = "pending_login_greeting";

export function useLoginGreeting() {
  const { user, mfaStatus, profile } = useAuth();
  const hasAttemptedRef = useRef(false);

  useEffect(() => {
    if (!user) {
      hasAttemptedRef.current = false;
      sessionStorage.removeItem(PENDING_GREETING_KEY);
      return;
    }

    const shouldGreet =
      sessionStorage.getItem(PENDING_GREETING_KEY) === "1" &&
      !!profile &&
      (mfaStatus === "verified" || mfaStatus === "not_required") &&
      !hasAttemptedRef.current;

    if (!shouldGreet) return;

    hasAttemptedRef.current = true;

    const name = profile.name?.split(" ")[0] || "there";
    const hour = new Date().getHours();
    let timeGreeting = "Good day";
    if (hour < 12) timeGreeting = "Good morning";
    else if (hour < 17) timeGreeting = "Good afternoon";
    else timeGreeting = "Good evening";

    const motivationalQuotes = [
      "Let's make your day productive!",
      "Small steps every day lead to big results.",
      "You've got the power to crush it today!",
      "Stay focused, stay sharp — great things are ahead.",
      "Every call you make brings you closer to your goal.",
      "Champions are built one day at a time. Let's go!",
      "Your energy sets the tone — bring your best today.",
      "Consistency beats talent. Keep showing up!",
      "Today is a fresh opportunity to make an impact.",
      "Winners don't wait for chances — they create them.",
      "Believe in your hustle. Results will follow.",
      "One more follow-up could change everything. Keep going!",
      "Success loves speed. Let's move fast today!",
      "The team that grinds together, wins together.",
      "Your pipeline is your lifeline — let's fill it up today!",
    ];

    const dayIndex = new Date().getDate() % motivationalQuotes.length;
    const motivation = motivationalQuotes[dayIndex];
    const message = `${timeGreeting}, ${name}! Welcome to Xboom Flow. ${motivation}`;

    const timer = window.setTimeout(() => {
      void (async () => {
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
            const errorText = await response.text();
            throw new Error(`ElevenLabs TTS failed [${response.status}]: ${errorText}`);
          }

          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          audio.preload = "auto";
          audio.volume = 0.9;

          await audio.play();
          sessionStorage.removeItem(PENDING_GREETING_KEY);

          audio.addEventListener("ended", () => {
            URL.revokeObjectURL(audioUrl);
          });
        } catch (error) {
          console.error("[Greeting] ElevenLabs playback failed", error);
          hasAttemptedRef.current = false;
        }
      })();
    }, 300);

    return () => window.clearTimeout(timer);
  }, [user, profile, mfaStatus]);
}
