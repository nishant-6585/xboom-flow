// Direct DigiLocker (MeriPehchaan) adapter.
//
// Aadhaar eKYC is NOT available on the direct partner API — the allowed
// document types under our org (in.xboom) are Driving Licence and PAN
// Verification Record. This adapter implements MeriPehchaan OAuth 2.0
// (authorization code + PKCE) and normalises the fetched document into
// the KycVerifiedData shape the rest of the system already understands.
//
// Env:
//   DIGILOCKER_CLIENT_ID       — Requestor client id
//   DIGILOCKER_CLIENT_SECRET   — server-side only
//   DIGILOCKER_REDIRECT_URI    — exact string registered with DigiLocker
//   DIGILOCKER_BASE_URL        — MeriPehchaan base URL from partner spec

import type {
  KycCustomerInput,
  KycProvider,
  OAuthKycProvider,
  KycSessionHandle,
  KycSessionStatus,
  KycVerifiedData,
} from "../kyc-provider.ts";
import { DocumentTypeDeniedError } from "../kyc-provider.ts";

function env(name: string, required = true): string {
  const v = Deno.env.get(name) || "";
  if (!v && required) throw new Error(`${name} is not configured`);
  return v;
}

function baseUrl(): string {
  return (env("DIGILOCKER_BASE_URL") || "").replace(/\/+$/, "");
}

// ── PKCE helpers ──────────────────────────────────────────────────────────
function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomB64Url(byteLen = 32): string {
  const a = new Uint8Array(byteLen);
  crypto.getRandomValues(a);
  return b64url(a);
}

async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(digest);
}

/**
 * Result carried on `KycSessionHandle.raw` for OAuth flow so the initiate
 * function knows what to persist for the callback.
 */
export interface OAuthAuthorizeMeta {
  state: string;
  codeVerifier: string;
  authorizeUrl: string;
}

// ── Document parsing ──────────────────────────────────────────────────────
// DigiLocker "issued files" doctypes we accept.
const DL_DOCTYPES = new Set(["DRVLC", "DL"]);
const PAN_DOCTYPES = new Set(["PANCR", "PAN"]);

function classifyDoctype(doctype: string): "driving_license" | "pan" | null {
  const t = doctype.toUpperCase();
  if (DL_DOCTYPES.has(t)) return "driving_license";
  if (PAN_DOCTYPES.has(t)) return "pan";
  return null;
}

function attr(xml: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i");
  const m = xml.match(re);
  return m ? m[1] : null;
}

function tagText(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function maskDocNumber(n: string | null): string | null {
  if (!n) return null;
  const clean = n.replace(/\s+/g, "");
  if (clean.length < 4) return null;
  const last4 = clean.slice(-4);
  return `${"X".repeat(Math.max(clean.length - 4, 4))} ${last4}`.trim();
}

function parseDigiLockerXml(
  xml: string,
  docKind: "driving_license" | "pan",
): KycVerifiedData {
  const name =
    attr(xml, "name") ||
    tagText(xml, "Name") ||
    tagText(xml, "name") ||
    null;
  const dob =
    attr(xml, "dob") ||
    tagText(xml, "DOB") ||
    tagText(xml, "dob") ||
    null;
  const address =
    tagText(xml, "Address") ||
    tagText(xml, "address") ||
    attr(xml, "address") ||
    null;

  // Document number varies by issuer XML. Try common attributes/tags.
  const rawNumber =
    attr(xml, "number") ||
    attr(xml, "dlNumber") ||
    attr(xml, "panNumber") ||
    tagText(xml, "PANNumber") ||
    tagText(xml, "DLNumber") ||
    tagText(xml, "IdRef") ||
    tagText(xml, "issuerRefNo") ||
    null;

  return {
    name: name?.trim() || null,
    dob: dob?.trim() || null,
    gender: attr(xml, "gender"),
    address: address?.trim() || null,
    maskedAadhaar: null,
    aadhaarLast4: null,
    documentType: docKind,
    maskedDocumentNumber: maskDocNumber(rawNumber),
    documentNumberFull: rawNumber ? rawNumber.replace(/\s+/g, "") : null,
    raw: { xml, docType: docKind },
  };
}

// ── Provider ──────────────────────────────────────────────────────────────
export class DigiLockerDirectProvider implements OAuthKycProvider {
  readonly name = "digilocker_direct";
  readonly oauth = true as const;

  async createVerificationSession(
    customer: KycCustomerInput,
    _redirectUrl: string,
  ): Promise<KycSessionHandle> {
    // DigiLocker rejects callbacks that don't match the registered URI, so
    // we ignore `_redirectUrl` and always use the exact env-configured one.
    const redirectUri = env("DIGILOCKER_REDIRECT_URI");
    const clientId = env("DIGILOCKER_CLIENT_ID");
    const state = randomB64Url(24);
    const codeVerifier = randomB64Url(48);
    const codeChallenge = await s256(codeVerifier);
    const sessionId = randomB64Url(16);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    const authorizeUrl = `${baseUrl()}/public/oauth2/1/authorize?${params.toString()}`;

    const meta: OAuthAuthorizeMeta = { state, codeVerifier, authorizeUrl };
    return {
      sessionId,
      consentUrl: authorizeUrl,
      provider: this.name,
      raw: meta,
    };
  }

  // Not applicable in an OAuth code flow — status is inferred by the callback.
  async getSessionStatus(_sessionId: string): Promise<KycSessionStatus> {
    return "created";
  }

  // Kept to satisfy the base interface, but the callback uses
  // exchangeCodeAndFetch instead. Throw so accidental use surfaces.
  async fetchVerifiedData(_sessionId: string): Promise<KycVerifiedData> {
    throw new Error("digilocker_direct: use exchangeCodeAndFetch");
  }

  // OAuth adapters authenticate the caller by validating the state token
  // stored in kyc_digilocker_sessions, not an HMAC header. Always false.
  verifyWebhook(_req: Request, _rawBody: string): boolean {
    return false;
  }

  async exchangeCodeAndFetch(
    code: string,
    codeVerifier: string,
    redirectUri: string,
  ): Promise<KycVerifiedData> {
    const clientId = env("DIGILOCKER_CLIENT_ID");
    const clientSecret = env("DIGILOCKER_CLIENT_SECRET");

    const tokenRes = await fetch(`${baseUrl()}/public/oauth2/1/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }).toString(),
    });
    const tokenText = await tokenRes.text();
    if (!tokenRes.ok) {
      throw new Error(`[digilocker_direct] token exchange failed: ${tokenRes.status} ${tokenText.slice(0, 300)}`);
    }
    let tokenJson: any;
    try { tokenJson = JSON.parse(tokenText); }
    catch { throw new Error("[digilocker_direct] token response was not JSON"); }
    const accessToken = tokenJson?.access_token;
    if (!accessToken) throw new Error("[digilocker_direct] no access_token in response");

    // 1. List issued documents
    const listRes = await fetch(`${baseUrl()}/public/oauth2/1/files/issued`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!listRes.ok) {
      const txt = await listRes.text();
      throw new Error(`[digilocker_direct] issued list ${listRes.status}: ${txt.slice(0, 200)}`);
    }
    const listJson: any = await listRes.json().catch(() => ({}));
    const items: any[] = Array.isArray(listJson?.items) ? listJson.items : Array.isArray(listJson) ? listJson : [];

    // Prefer DL, then PAN
    const ordered = [
      ...items.filter((i) => classifyDoctype(String(i?.doctype || "")) === "driving_license"),
      ...items.filter((i) => classifyDoctype(String(i?.doctype || "")) === "pan"),
    ];
    if (ordered.length === 0) {
      throw new DocumentTypeDeniedError(
        "No Driving Licence or PAN available in this DigiLocker account",
      );
    }

    // 2. Fetch first available document XML
    let lastErr: unknown = null;
    for (const it of ordered) {
      const uri = it?.uri;
      if (!uri) continue;
      const kind = classifyDoctype(String(it?.doctype || ""));
      if (!kind) continue;
      const xmlRes = await fetch(
        `${baseUrl()}/public/oauth2/1/xml/${encodeURIComponent(uri)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!xmlRes.ok) {
        lastErr = new Error(`[digilocker_direct] xml ${xmlRes.status} for ${uri}`);
        continue;
      }
      const xml = await xmlRes.text();
      const parsed = parseDigiLockerXml(xml, kind);
      // Preserve issued-list metadata alongside XML for auditability
      parsed.raw = { xml, docType: kind, issued: it, tokenScope: tokenJson?.scope ?? null };
      return parsed;
    }
    // Every candidate 4xx/5xx'd → treat as denial (customer likely revoked scope).
    throw new DocumentTypeDeniedError(
      "DigiLocker refused to release the requested document",
    );
  }
}

// Re-export types for tests
export type { KycProvider };