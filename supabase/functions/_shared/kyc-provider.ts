// KYC provider seam.
//
// The KYC flow talks to this file ONLY — never to a specific vendor.
// Swap vendors (Surepass → Setu → direct DigiLocker) by adding a new
// adapter under ./kyc-providers/ and pointing the KYC_PROVIDER env var
// at it. No callers change.

import { SurepassProvider } from "./kyc-providers/surepass.ts";
import { DigiLockerDirectProvider } from "./kyc-providers/digilocker-direct.ts";

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
  /** For direct-DigiLocker: 'driving_license' | 'pan' | 'aadhaar' */
  documentType?: string | null;
  /** Masked form of the document number regardless of type (e.g. "XXXX 1234"). */
  maskedDocumentNumber?: string | null;
  /** Full document number for compliance retrieval (deny-all storage). */
  documentNumberFull?: string | null;
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

/**
 * OAuth-shaped adapter (direct DigiLocker / MeriPehchaan style).
 *
 * When `oauth === true`, the callback edge function drives the flow as an
 * OAuth 2.0 authorization-code grant (GET redirect with ?code&state), rather
 * than a webhook POST. `createVerificationSession` returns an authorize URL
 * as `consentUrl` and MUST also emit `state` + `codeVerifier` for the
 * initiate function to persist server-side.
 */
export interface OAuthKycProvider extends KycProvider {
  readonly oauth: true;
  /** Exchange authorization code for tokens and fetch the verified document. */
  exchangeCodeAndFetch(
    code: string,
    codeVerifier: string,
    redirectUri: string,
  ): Promise<KycVerifiedData>;
}

export function isOAuthKycProvider(p: KycProvider): p is OAuthKycProvider {
  return (p as OAuthKycProvider).oauth === true;
}

/** Distinct thrown error the callback maps to audit reason 'document_type_denied'. */
export class DocumentTypeDeniedError extends Error {
  constructor(msg = "DigiLocker refused the requested document") {
    super(msg);
    this.name = "DocumentTypeDeniedError";
  }
}

const REGISTRY: Record<string, () => KycProvider> = {
  surepass: () => new SurepassProvider(),
  digilocker_direct: () => new DigiLockerDirectProvider(),
};

export function getKycProvider(name?: string): KycProvider {
  const key = (name || Deno.env.get("KYC_PROVIDER") || "surepass").toLowerCase();
  const factory = REGISTRY[key];
  if (!factory) {
    throw new Error(`Unknown KYC provider: ${key}`);
  }
  return factory();
}