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
 * Hash a string using SHA-256.
 */
async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a device fingerprint combining multiple signals to resist spoofing.
 * Uses device_id + userAgent + platform for environment binding.
 */
export async function generateDeviceFingerprint(deviceId: string): Promise<string> {
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const lang = navigator.language || "";
  const screenRes = `${screen.width}x${screen.height}x${screen.colorDepth}`;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";

  const raw = `${deviceId}|${ua}|${platform}|${lang}|${screenRes}|${tz}`;
  return sha256(raw);
}

/**
 * Hash the device ID using SHA-256 before sending to the backend.
 */
async function hashDeviceId(deviceId: string): Promise<string> {
  return sha256(deviceId);
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
 * Uses a server-side SECURITY DEFINER function with fingerprint verification.
 */
export async function isDeviceTrusted(userId: string): Promise<boolean> {
  try {
    const deviceId = getDeviceId();
    const deviceHash = await hashDeviceId(deviceId);
    const fingerprint = await generateDeviceFingerprint(deviceId);

    const { data, error } = await supabase.rpc("check_device_trust", {
      p_user_id: userId,
      p_device_hash: deviceHash,
      p_device_fingerprint: fingerprint,
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
    const fingerprint = await generateDeviceFingerprint(deviceId);

    const { error } = await supabase.rpc("register_trusted_device", {
      p_user_id: userId,
      p_device_hash: deviceHash,
      p_device_name: deviceName,
      p_days: days,
      p_device_fingerprint: fingerprint,
    });

    if (error) {
      console.warn("[DeviceTrust] Registration failed:", error.message);
    } else {
      console.log("[DeviceTrust] Device registered for", days, "days");
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
 * Record the MFA verification timestamp in the current session.
 */
export async function recordMfaVerifiedAt(userId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc("update_mfa_verified_at", {
      p_user_id: userId,
    });
    if (error) {
      console.warn("[DeviceTrust] Failed to record MFA timestamp:", error.message);
    }
    // Also store locally for fast lookups
    localStorage.setItem("last_mfa_verified_at", new Date().toISOString());
  } catch (e) {
    console.warn("[DeviceTrust] Exception recording MFA timestamp:", e);
  }
}

/**
 * Check if step-up MFA re-verification is needed (last verified > 24h ago).
 * Uses fast local check first, then server verification.
 */
export async function needsStepUpAuth(userId: string): Promise<boolean> {
  try {
    // Fast local check
    const localTs = localStorage.getItem("last_mfa_verified_at");
    if (localTs) {
      const elapsed = Date.now() - new Date(localTs).getTime();
      if (elapsed < 24 * 60 * 60 * 1000) return false;
    }

    // Server check
    const { data, error } = await supabase.rpc("needs_step_up_auth", {
      p_user_id: userId,
    });
    if (error) {
      console.warn("[DeviceTrust] Step-up check failed:", error.message);
      return true; // Fail-secure
    }
    return data === true;
  } catch (e) {
    console.warn("[DeviceTrust] Exception in step-up check:", e);
    return true; // Fail-secure
  }
}

/**
 * Revoke all trusted devices for the current user.
 */
export async function revokeAllDevices(): Promise<void> {
  try {
    const { error } = await supabase
      .from("trusted_devices")
      .update({ is_revoked: true } as any)
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
  localStorage.removeItem("last_mfa_verified_at");
}
