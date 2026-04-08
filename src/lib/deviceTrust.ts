import { supabase } from "@/integrations/supabase/client";

const DEVICE_ID_KEY = "xboom_device_id";

/**
 * Get or create a stable device identifier.
 * Stored in localStorage; survives page refreshes.
 */
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/**
 * Hash the device ID using SHA-256 before sending to the backend.
 */
async function hashDeviceId(deviceId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(deviceId);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Get a human-readable device name from the user agent.
 */
function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return "iOS Device";
  if (/Android/.test(ua)) return "Android Device";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown Device";
}

/**
 * Check if the current device is trusted for the given user.
 * Uses a server-side SECURITY DEFINER function.
 */
export async function isDeviceTrusted(userId: string): Promise<boolean> {
  try {
    const deviceId = getDeviceId();
    const deviceHash = await hashDeviceId(deviceId);

    const { data, error } = await supabase.rpc("check_device_trust", {
      p_user_id: userId,
      p_device_hash: deviceHash,
    });

    if (error) {
      console.warn("[DeviceTrust] Check failed:", error.message);
      return false;
    }

    return data === true;
  } catch (e) {
    console.warn("[DeviceTrust] Exception during check:", e);
    return false;
  }
}

/**
 * Register the current device as trusted (after successful MFA).
 * @param userId - The authenticated user's ID
 * @param days - How many days to trust (default 30)
 */
export async function registerTrustedDevice(
  userId: string,
  days: number = 30
): Promise<void> {
  try {
    const deviceId = getDeviceId();
    const deviceHash = await hashDeviceId(deviceId);
    const deviceName = getDeviceName();

    const { error } = await supabase.rpc("register_trusted_device", {
      p_user_id: userId,
      p_device_hash: deviceHash,
      p_device_name: deviceName,
      p_days: days,
    });

    if (error) {
      console.warn("[DeviceTrust] Registration failed:", error.message);
    } else {
      console.log("[DeviceTrust] Device registered for", days, "days");
      // Also update localStorage for fast client-side check
      localStorage.setItem(
        "mfa_device_trust",
        JSON.stringify({
          userId,
          expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
        })
      );
    }
  } catch (e) {
    console.warn("[DeviceTrust] Exception during registration:", e);
  }
}

/**
 * Revoke all trusted devices for the current user.
 */
export async function revokeAllDevices(): Promise<void> {
  try {
    const { error } = await supabase
      .from("trusted_devices")
      .update({ is_revoked: true })
      .eq("is_revoked", false);

    if (error) {
      console.warn("[DeviceTrust] Revoke failed:", error.message);
    }
    localStorage.removeItem(DEVICE_ID_KEY);
    localStorage.removeItem("mfa_device_trust");
  } catch (e) {
    console.warn("[DeviceTrust] Exception during revoke:", e);
  }
}

/**
 * Clear local device trust data (used on signOut).
 */
export function clearLocalDeviceTrust(): void {
  localStorage.removeItem("mfa_device_trust");
}
