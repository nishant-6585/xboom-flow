// Surepass DigiLocker adapter.
//
// Implements the KycProvider seam against Surepass's DigiLocker APIs.
// Endpoints/shape based on Surepass DigiLocker docs — accessed via a
// bearer token stored as SUREPASS_API_TOKEN. Base URL configurable via
// SUREPASS_BASE_URL (defaults to prod).
//
// Nothing outside this file should know Surepass exists.

import type {
  KycCustomerInput,
  KycProvider,
  KycSessionHandle,
  KycSessionStatus,
  KycVerifiedData,
} from "../kyc-provider.ts";

const DEFAULT_BASE_URL = "https://kyc-api.surepass.io";

function baseUrl(): string {
  return (Deno.env.get("SUREPASS_BASE_URL") || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function token(): string {
  const t = Deno.env.get("SUREPASS_API_TOKEN");
  if (!t) throw new Error("SUREPASS_API_TOKEN is not configured");
  return t;
}

async function sp<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* fall through */ }
  if (!res.ok) {
    const msg = json?.message || json?.error || `Surepass ${res.status}`;
    throw new Error(`[surepass] ${msg}`);
  }
  return json as T;
}

function maskAadhaar(n: string | null | undefined): string | null {
  if (!n) return null;
  const digits = String(n).replace(/\D/g, "");
  if (digits.length < 4) return null;
  return `XXXX XXXX ${digits.slice(-4)}`;
}

function pickString(obj: any, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export class SurepassProvider implements KycProvider {
  readonly name = "surepass";

  async createVerificationSession(
    customer: KycCustomerInput,
    redirectUrl: string,
  ): Promise<KycSessionHandle> {
    // Surepass DigiLocker "initialize" endpoint. Shape follows their
    // published DigiLocker docs. Any harmless client_ref echo lets us
    // trace sessions back to a portal account on webhook.
    const payload = {
      redirect_url: redirectUrl,
      client_ref: customer.accountId,
      customer_details: {
        name: customer.fullName || undefined,
        email: customer.email || undefined,
        mobile: customer.phone || undefined,
      },
      order_reference: customer.orderNumber || undefined,
    };
    const res = await sp<any>("/api/v1/digilocker/initialize", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const data = res?.data ?? res ?? {};
    const sessionId = data.client_id || data.session_id || data.id;
    const consentUrl = data.url || data.redirect_url || data.consent_url;
    if (!sessionId || !consentUrl) {
      throw new Error("[surepass] initialize response missing session id / consent url");
    }
    return { sessionId, consentUrl, provider: this.name, raw: res };
  }

  async getSessionStatus(sessionId: string): Promise<KycSessionStatus> {
    const res = await sp<any>(`/api/v1/digilocker/status/${encodeURIComponent(sessionId)}`, {
      method: "GET",
    });
    const s = String(res?.data?.status || res?.status || "").toLowerCase();
    if (s.includes("verif") || s === "success" || s === "completed") return "verified";
    if (s.includes("consent")) return "consent_completed";
    if (s.includes("pending")) return "consent_pending";
    if (s.includes("expire")) return "expired";
    if (s.includes("fail") || s.includes("error")) return "failed";
    return "created";
  }

  async fetchVerifiedData(sessionId: string): Promise<KycVerifiedData> {
    const res = await sp<any>(
      `/api/v1/digilocker/download-aadhaar/${encodeURIComponent(sessionId)}`,
      { method: "GET" },
    );
    const data = res?.data ?? {};
    const aadhaar = pickString(data, ["aadhaar_number", "uid", "aadhaar"]);
    const digits = aadhaar ? aadhaar.replace(/\D/g, "") : "";
    return {
      name: pickString(data, ["name", "full_name", "user_name"]),
      dob: pickString(data, ["dob", "date_of_birth", "birth_date"]),
      gender: pickString(data, ["gender"]),
      address: pickString(data, ["address", "full_address"]) ??
        (typeof data.address === "object" ? JSON.stringify(data.address) : null),
      maskedAadhaar: maskAadhaar(aadhaar),
      aadhaarLast4: digits.length >= 4 ? digits.slice(-4) : null,
      raw: res,
    };
  }

  async verifyWebhook(req: Request, rawBody: string): Promise<boolean> {
    // Fail closed: without a configured secret we NEVER trust a webhook.
    const secret = Deno.env.get("SUREPASS_WEBHOOK_SECRET");
    if (!secret) return false;

    // Surepass typically delivers an HMAC-SHA256 hex digest in one of these
    // headers. Accept either name; still fail if none present.
    const sig =
      req.headers.get("x-surepass-signature") ||
      req.headers.get("x-webhook-signature") ||
      "";
    if (!sig) return false;

    try {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const macBytes = new Uint8Array(
        await crypto.subtle.sign("HMAC", key, enc.encode(rawBody)),
      );
      const hex = Array.from(macBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
      // constant-time compare
      const a = hex.toLowerCase();
      const b = sig.replace(/^sha256=/i, "").toLowerCase();
      if (a.length !== b.length) return false;
      let diff = 0;
      for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
      return diff === 0;
    } catch (_e) {
      return false;
    }
  }
}