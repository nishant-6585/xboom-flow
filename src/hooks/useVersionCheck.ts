// Detects when a newer build has been deployed and prompts the user to
// refresh. Solves the recurring stale-bundle problem: SPA users keep old
// tabs open for hours/days and end up on JavaScript from before the latest
// fixes, where things silently misbehave.
//
// How: vite.config.ts bakes __BUILD_ID__ into the bundle and emits the same
// id as /version.json next to the built assets. This hook re-fetches
// version.json whenever the tab regains focus, PLUS a slow 15-minute
// heartbeat so long uninterrupted sessions still get the prompt without
// ever switching tabs. (A fast timer felt noisy with frequent publishes;
// 15 minutes is the compromise.) Shows a persistent "Refresh" toast when
// the server's id differs from the running bundle's.

import { useEffect } from "react";
import { toast } from "sonner";

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const TOAST_ID = "app-update-available";

export function useVersionCheck() {
  useEffect(() => {
    // Dev server doesn't emit version.json (and HMR keeps code fresh anyway).
    if (import.meta.env.DEV) return;

    let stopped = false;

    const check = async () => {
      try {
        const res = await fetch(`/version.json?_=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data: { buildId?: string } = await res.json();
        if (!stopped && data.buildId && data.buildId !== __BUILD_ID__) {
          toast.info("A new version of XBoom Flow is available.", {
            id: TOAST_ID, // fixed id — re-checks update the toast instead of stacking
            duration: Infinity,
            description: "Refresh to get the latest fixes and features.",
            action: {
              label: "Refresh",
              onClick: () => window.location.reload(),
            },
          });
        }
      } catch {
        // Offline or version.json missing (e.g. older deploy) — stay quiet.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };

    const interval = setInterval(check, CHECK_INTERVAL_MS);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    check();

    return () => {
      stopped = true;
      clearInterval(interval);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
