import { supabase } from "@/integrations/supabase/client";

interface DeviceInfo {
  browser: string;
  os: string;
  device: string;
}

function parseUserAgent(): DeviceInfo {
  const ua = navigator.userAgent;
  
  // Browser detection
  let browser = "Unknown";
  if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome/") && !ua.includes("Edg/")) browser = "Chrome";
  else if (ua.includes("Safari/") && !ua.includes("Chrome/")) browser = "Safari";
  else if (ua.includes("Opera/") || ua.includes("OPR/")) browser = "Opera";

  // OS detection
  let os = "Unknown";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Linux") && !ua.includes("Android")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  else if (ua.includes("CrOS")) os = "Chrome OS";

  // Device type
  let device = "Desktop";
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) device = "Mobile";
  else if (/Tablet|iPad/i.test(ua)) device = "Tablet";

  return { browser, os, device };
}

export async function recordSession(userId: string): Promise<void> {
  try {
    const { browser, os, device } = parseUserAgent();

    // Demote any prior "current" rows for this user to non-current — but DO NOT
    // revoke them (is_active stays true). This allows the same user to stay
    // signed in on multiple devices/tabs concurrently; only the newest login
    // owns the `is_current` flag (used purely for the "current session" badge
    // in Security Settings). Other devices keep their active rows so their
    // session validator does not force-logout them.
    await supabase
      .from("user_sessions")
      .update({ is_current: false })
      .eq("user_id", userId)
      .eq("is_current", true);

    // Insert new session
    const { data: inserted } = await supabase
      .from("user_sessions")
      .insert({
        user_id: userId,
        browser,
        os,
        device_info: device,
        is_current: true,
        is_active: true,
        last_active_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();

    if (inserted?.id && typeof window !== "undefined") {
      try {
        sessionStorage.setItem("xboom_session_row_id", inserted.id);
      } catch {}
    }
  } catch (e) {
    console.warn("Failed to record session:", e);
  }
}

/**
 * Returns the session_row_id this tab owns (set by recordSession on fresh login).
 * Used by useSessionPolicy to validate/refresh ONLY this tab's row instead of
 * relying on the user-wide `is_current` flag, which can be flipped by other
 * devices logging in.
 */
export function getCurrentSessionRowId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem("xboom_session_row_id");
  } catch {
    return null;
  }
}

export async function enrichLoginAttempt(): Promise<{ browser: string; os: string; device: string }> {
  const { browser, os, device } = parseUserAgent();
  return { browser, os, device };
}
