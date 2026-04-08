import { supabase } from "@/integrations/supabase/client";

const DEVICE_ID_KEY = "xboom_device_id";

// ── Helpers ──────────────────────────────────────────────

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Extract a coarse browser family string that is stable across minor UA updates.
 */
function browserFamily(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("OPR/") || ua.includes("Opera")) return "Opera";
  if (ua.includes("Chrome/") && !ua.includes("Edg/")) return "Chrome";
  if (ua.includes("Safari/") && !ua.includes("Chrome")) return "Safari";
  if (ua.includes("Firefox/")) return "Firefox";
  return "Other";
}

// ── Split Fingerprints ───────────────────────────────────

/**
 * Stable fingerprint — changes only when the user switches device/browser entirely.
 * Uses: device_id + platform + browser family
 */
export async function stableFingerprint(deviceId: string): Promise<string> {
  const raw = `${deviceId}|${navigator.platform || ""}|${browserFamily()}`;
  return sha256(raw);
}

/**
 * Dynamic fingerprint — may change with OS updates, resolution changes, tz travel.
 * Uses: full userAgent + screen resolution + colour depth + timezone
 */
export async function dynamicFingerprint(): Promise<string> {
  const raw = [
    navigator.userAgent,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    String((navigator as any).hardwareConcurrency ?? ""),
    String((navigator as any).deviceMemory ?? ""),
    navigator.language || "",
  ].join("|");
  return sha256(raw);
}

/** Legacy combined fingerprint kept for backward-compat column. */
export async function generateDeviceFingerprint(deviceId: string): Promise<string> {
  const raw = `${deviceId}|${navigator.userAgent}|${navigator.platform}|${navigator.language}|${screen.width}x${screen.height}x${screen.colorDepth}|${Intl.DateTimeFormat().resolvedOptions().timeZone || ""}`;
  return sha256(raw);
}

function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return "iOS Device";
  if (/Android/.test(ua)) return "Android Device";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown Device";
}

// ── Trust Check ──────────────────────────────────────────

export type DeviceTrustResult = "trusted" | "step_up" | "untrusted";

/**
 * Check device trust using split fingerprints.
 * Returns 'trusted' | 'step_up' | 'untrusted'.
 */
export async function checkDeviceTrustV2(userId: string): Promise<DeviceTrustResult> {
  try {
    const deviceId = getDeviceId();
    const deviceHash = await sha256(deviceId);
    const sFp = await stableFingerprint(deviceId);
    const dFp = await dynamicFingerprint();

    const { data, error } = await supabase.rpc("check_device_trust_v2", {
      p_user_id: userId,
      p_device_hash: deviceHash,
      p_stable_fingerprint: sFp,
      p_dynamic_fingerprint: dFp,
    });

    if (error) {
      console.warn("[DeviceTrust] V2 check failed:", error.message);
      return "untrusted";
    }

    return (data as DeviceTrustResult) || "untrusted";
  } catch (e) {
    console.warn("[DeviceTrust] V2 exception:", e);
    return "untrusted";
  }
}

/** Boolean wrapper for backward-compat callers. */
export async function isDeviceTrusted(userId: string): Promise<boolean> {
  const result = await checkDeviceTrustV2(userId);
  return result !== "untrusted";
}

// ── Registration ─────────────────────────────────────────

export async function registerTrustedDevice(userId: string, days = 30): Promise<void> {
  try {
    const deviceId = getDeviceId();
    const deviceHash = await sha256(deviceId);
    const fp = await generateDeviceFingerprint(deviceId);
    const sFp = await stableFingerprint(deviceId);
    const dFp = await dynamicFingerprint();

    const { error } = await supabase.rpc("register_trusted_device", {
      p_user_id: userId,
      p_device_hash: deviceHash,
      p_device_name: getDeviceName(),
      p_days: days,
      p_device_fingerprint: fp,
      p_stable_fingerprint: sFp,
      p_dynamic_fingerprint: dFp,
    });

    if (error) {
      console.warn("[DeviceTrust] Registration failed:", error.message);
    } else {
      console.log("[DeviceTrust] Device registered for", days, "days");
      localStorage.setItem(
        "mfa_device_trust",
        JSON.stringify({
          userId,
          expiresAt: new Date(Date.now() + days * 86_400_000).toISOString(),
        })
      );
    }
  } catch (e) {
    console.warn("[DeviceTrust] Exception during registration:", e);
  }
}

// ── Step-Up Auth Helpers ─────────────────────────────────

export async function recordMfaVerifiedAt(userId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc("update_mfa_verified_at", { p_user_id: userId });
    if (error) console.warn("[DeviceTrust] MFA timestamp failed:", error.message);
    localStorage.setItem("last_mfa_verified_at", new Date().toISOString());
  } catch (e) {
    console.warn("[DeviceTrust] MFA timestamp exception:", e);
  }
}

export async function needsStepUpAuth(userId: string): Promise<boolean> {
  try {
    const localTs = localStorage.getItem("last_mfa_verified_at");
    if (localTs && Date.now() - new Date(localTs).getTime() < 86_400_000) return false;

    const { data, error } = await supabase.rpc("needs_step_up_auth", { p_user_id: userId });
    if (error) {
      console.warn("[DeviceTrust] Step-up check failed:", error.message);
      return true;
    }
    return data === true;
  } catch {
    return true;
  }
}

// ── Revocation ───────────────────────────────────────────

export async function revokeAllDevices(): Promise<void> {
  try {
    const { error } = await supabase
      .from("trusted_devices")
      .update({ is_revoked: true } as any)
      .eq("is_revoked", false);
    if (error) console.warn("[DeviceTrust] Revoke failed:", error.message);
    localStorage.removeItem(DEVICE_ID_KEY);
    localStorage.removeItem("mfa_device_trust");
  } catch (e) {
    console.warn("[DeviceTrust] Revoke exception:", e);
  }
}

export function clearLocalDeviceTrust(): void {
  localStorage.removeItem("mfa_device_trust");
  localStorage.removeItem("last_mfa_verified_at");
}
