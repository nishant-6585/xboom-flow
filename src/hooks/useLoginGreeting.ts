import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { playGeneratedAudio } from "@/lib/audioPlayback";

const PENDING_GREETING_KEY = "pending_login_greeting";

// Female voice - Sarah (natural, warm)
const VOICE_ID = "EXAVITQu4vr4xnSDxMaL";

async function fetchSalesStats(userId: string): Promise<{ ordersClosed: number; followUpsToday: number }> {
  const today = new Date().toISOString().slice(0, 10);

  const [ordersResult, pipelineResult] = await Promise.all([
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("sales_person_id", userId)
      .eq("order_date", today),
    supabase
      .from("pipeline_orders")
      .select("id", { count: "exact", head: true })
      .eq("sales_person_id", userId)
      .eq("expected_closure_date", today)
      .not("status", "eq", "converted"),
  ]);

  return {
    ordersClosed: ordersResult.count ?? 0,
    followUpsToday: pipelineResult.count ?? 0,
  };
}

export function useLoginGreeting() {
  const { user, mfaStatus, profile, roles } = useAuth();
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

    const isSalesPerson = roles.includes("sales") || roles.includes("sales_manager");

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          console.info("[Greeting] Starting ElevenLabs greeting flow");
          let salesPart = "";

          if (isSalesPerson) {
            const stats = await fetchSalesStats(user.id);
            const parts: string[] = [];

            if (stats.ordersClosed > 0) {
              parts.push(`You've closed ${stats.ordersClosed} order${stats.ordersClosed > 1 ? "s" : ""} today. Great work!`);
            }

            if (stats.followUpsToday > 0) {
              parts.push(`You have ${stats.followUpsToday} follow-up${stats.followUpsToday > 1 ? "s" : ""} scheduled for today.`);
            } else if (stats.ordersClosed === 0) {
              parts.push("No follow-ups scheduled yet. Time to fill up that pipeline!");
            }

            salesPart = " " + parts.join(" ");
          }

          const message = `${timeGreeting}, ${name}! Welcome to Xboom Flow.${salesPart} ${motivation}`;

          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              },
              body: JSON.stringify({ text: message, voiceId: VOICE_ID }),
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`ElevenLabs TTS failed [${response.status}]: ${errorText}`);
          }

          const audioBuffer = await response.arrayBuffer();
          console.info("[Greeting] ElevenLabs audio received", { bytes: audioBuffer.byteLength });

          await playGeneratedAudio(audioBuffer, 0.9);
          console.info("[Greeting] ElevenLabs audio playback completed");
          sessionStorage.removeItem(PENDING_GREETING_KEY);
        } catch (error) {
          console.error("[Greeting] ElevenLabs playback failed", error);
          hasAttemptedRef.current = false;
        }
      })();
    }, 300);

    return () => window.clearTimeout(timer);
  }, [user, profile, mfaStatus, roles]);
}
