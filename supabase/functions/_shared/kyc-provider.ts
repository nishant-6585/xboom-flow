// KYC provider seam.
//
// The KYC flow talks to this file ONLY — never to a specific vendor.
// Swap vendors (Surepass → Setu → direct DigiLocker) by adding a new
// adapter under ./kyc-providers/ and pointing the KYC_PROVIDER env var
// at it. No callers change.

import { SurepassProvider } from "./kyc-providers/surepass.ts";

export interface KycCustomerInput {
  accountId: string;
  fullName: string | null;
  email: string | null;
  phone?: string | null;
  // Optional order context — some providers can echo it back on webhook.
  orderId?: string | null;
  orderNumber?: string | null;
}

export interface KycSessionHandle {
  sessionId: string;
  /** URL the customer should be redirected to for DigiLocker consent. */
  consentUrl: string;
  provider: string;
  raw?: unknown;
}

export type KycSessionStatus =
  | "created"
  | "consent_pending"
  | "consent_completed"
  | "verified"
  | "failed"
  | "expired";

export interface KycVerifiedData {
  name: string | null;
  dob: string | null;         // ISO date if resolvable
  gender?: string | null;
  address: string | null;
  maskedAadhaar: string | null; // e.g. "XXXX XXXX 1234"
  aadhaarLast4: string | null;
  /** Full raw provider payload (opaque to callers). */
  raw: unknown;
}

export interface KycProvider {
  readonly name: string;
  createVerificationSession(
    customer: KycCustomerInput,
    redirectUrl: string,
  ): Promise<KycSessionHandle>;
  getSessionStatus(sessionId: string): Promise<KycSessionStatus>;
  fetchVerifiedData(sessionId: string): Promise<KycVerifiedData>;
  /** MUST fail closed: return false on any missing / invalid signature. */
  verifyWebhook(req: Request, rawBody: string): Promise<boolean> | boolean;
}

const REGISTRY: Record<string, () => KycProvider> = {
  surepass: () => new SurepassProvider(),
  // setu: () => new SetuProvider(),
  // digilocker_direct: () => new DigiLockerDirectProvider(),
};

export function getKycProvider(name?: string): KycProvider {
  const key = (name || Deno.env.get("KYC_PROVIDER") || "surepass").toLowerCase();
  const factory = REGISTRY[key];
  if (!factory) {
    throw new Error(`Unknown KYC provider: ${key}`);
  }
  return factory();
}