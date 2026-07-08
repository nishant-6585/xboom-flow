// Direct DigiLocker (MeriPehchaan) adapter.
//
// Aadhaar eKYC is NOT available on the direct partner API — the allowed
// document types under our org (in.xboom) are Driving Licence and PAN
// Verification Record. This adapter implements MeriPehchaan OAuth 2.0
// (authorization code + PKCE) per Requester–MeriPehchaan API Spec V2.3
// (base host: digilocker.meripehchaan.gov.in) and normalises the fetched
// document into the KycVerifiedData shape the rest of the system already
// understands.
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
  // Defensive normalisation: trim whitespace and strip any trailing
  // dots, slashes, or whitespace from the configured base URL. A hostname
  // with a trailing dot (e.g. "digilocker.meripehchaan.gov.in.") is a
  // distinct string to TLS and will not match the server certificate,
  // producing a "connection not private" error in the browser.
  return (env("DIGILOCKER_BASE_URL") || "").trim().replace(/[.\/\s]+$/, "");
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

// Base64 (standard, with padding) — used for hmac header comparison.
function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/**
 * Compute Base64(HMAC-SHA256(body, key)) and compare against the provider's
 * `hmac` response header in constant time. Returns true only on match.
 */
export async function verifyHmac(
  body: Uint8Array,
  key: string,
  headerHmac: string | null,
): Promise<boolean> {
  if (!headerHmac) return false;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, body);
  const expected = b64(sig);
  // Constant-time-ish compare
  if (expected.length !== headerHmac.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ headerHmac.charCodeAt(i);
  return diff === 0;
}

/** DDMMYYYY (DigiLocker token payload) → ISO YYYY-MM-DD. Returns null on garbage. */
export function parseDDMMYYYY(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = String(input).trim();
  // Already ISO?
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (!m) return null;
  const [_, dd, mm, yyyy] = m;
  const d = Number(dd), mo = Number(mm), y = Number(yyyy);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  return `${yyyy}-${mm}-${dd}`;
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

/** Verified-data payload the callback receives from `exchangeCodeAndFetch`. */
export interface DigiLockerExchangeResult extends KycVerifiedData {
  /** Fields from the token response (subset). */
  tokenIdentity: {
    digilockerid: string | null;
    name: string | null;
    dob: string | null;           // ISO
    gender: string | null;
    eaadhaar: string | null;
    consentValidTill: string | null;
  };
  /** Raw PDF binary of the selected DL/PAN certificate for reviewer parity. */
  pdf: Uint8Array | null;
  pdfFilename: string;
  /** Access token — held only for the best-effort revoke; never persisted. */
  accessToken: string;
  /** doctype code seen in the issued list (e.g. DRVLC, PANCR). */
  doctypeCode: string;
  /** Provider URI for the selected item. */
  uri: string;
}

/** Best-effort access-token revoke per spec §token hygiene. */
export async function revokeAccessToken(accessToken: string): Promise<void> {
  try {
    const clientId = env("DIGILOCKER_CLIENT_ID");
    const clientSecret = env("DIGILOCKER_CLIENT_SECRET");
    const basic = btoa(`${clientId}:${clientSecret}`);
    const res = await fetch(`${baseUrl()}/public/oauth2/1/revoke`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        token: accessToken,
        token_type_hint: "access_token",
      }).toString(),
    });
    // Consume body to avoid Deno resource leak
    await res.text();
    if (!res.ok) console.warn(`[digilocker_direct] revoke non-OK: ${res.status}`);
  } catch (e) {
    console.warn("[digilocker_direct] revoke failed:", (e as Error).message);
  }
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
      scope: "openid",
      purpose: "kyc",
      // Limit consent to the two document types we're authorised for.
      req_doctype: "DRVLC,PANCR",
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
  ): Promise<DigiLockerExchangeResult> {
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

    // Never persist refresh_token — strip early even from raw payload we may
    // pass around. (Spec §token hygiene.)
    if ("refresh_token" in tokenJson) delete tokenJson.refresh_token;

    const tokenIdentity = {
      digilockerid: tokenJson?.digilockerid ?? null,
      name: tokenJson?.name ?? null,
      dob: parseDDMMYYYY(tokenJson?.dob),
      gender: tokenJson?.gender ?? null,
      eaadhaar: tokenJson?.eaadhaar ?? null,
      consentValidTill: tokenJson?.consent_valid_till ?? null,
    };

    // 1. List issued documents (V2 endpoint per spec)
    const listRes = await fetch(`${baseUrl()}/public/oauth2/2/files/issued`, {
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
        "no_supported_document",
      );
    }

    // 2. For each candidate: fetch XML (with HMAC check), then the PDF (with
    //    HMAC check). Both must succeed on the same item, else move on.
    let lastErr: unknown = null;
    for (const it of ordered) {
      const uri = it?.uri;
      if (!uri) continue;
      const doctypeCode = String(it?.doctype || "");
      const kind = classifyDoctype(doctypeCode);
      if (!kind) continue;

      // 2a. XML with HMAC verification
      const xmlRes = await fetch(
        `${baseUrl()}/public/oauth2/1/xml/${encodeURIComponent(uri)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!xmlRes.ok) {
        lastErr = new Error(`[digilocker_direct] xml ${xmlRes.status} for ${uri}`);
        await xmlRes.text().catch(() => "");
        continue;
      }
      const xmlBuf = new Uint8Array(await xmlRes.arrayBuffer());
      const xmlHmac = xmlRes.headers.get("hmac");
      const xmlOk = await verifyHmac(xmlBuf, clientSecret, xmlHmac);
      if (!xmlOk) {
        lastErr = new Error("hmac_mismatch:xml");
        continue;
      }
      const xml = new TextDecoder().decode(xmlBuf);

      // 2b. PDF (file) with HMAC verification
      const fileRes = await fetch(
        `${baseUrl()}/public/oauth2/1/file/${encodeURIComponent(uri)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!fileRes.ok) {
        lastErr = new Error(`[digilocker_direct] file ${fileRes.status} for ${uri}`);
        await fileRes.text().catch(() => "");
        continue;
      }
      const pdfBuf = new Uint8Array(await fileRes.arrayBuffer());
      const pdfHmac = fileRes.headers.get("hmac");
      const pdfOk = await verifyHmac(pdfBuf, clientSecret, pdfHmac);
      if (!pdfOk) {
        lastErr = new Error("hmac_mismatch:file");
        continue;
      }

      const parsed = parseDigiLockerXml(xml, kind);
      // Prefer token-response identity for name when available.
      if (!parsed.name && tokenIdentity.name) parsed.name = tokenIdentity.name;
      if (!parsed.dob && tokenIdentity.dob) parsed.dob = tokenIdentity.dob;
      if (!parsed.gender && tokenIdentity.gender) parsed.gender = tokenIdentity.gender;

      const result: DigiLockerExchangeResult = {
        ...parsed,
        raw: { xml, docType: kind, issued: it, tokenScope: tokenJson?.scope ?? null },
        tokenIdentity,
        pdf: pdfBuf,
        pdfFilename: `digilocker-${kind}-${(uri || "cert").replace(/[^\w.\-]+/g, "_")}.pdf`,
        accessToken,
        doctypeCode,
        uri,
      };
      return result;
    }
    // Every candidate 4xx/5xx'd → treat as denial (customer likely revoked scope).
    throw new DocumentTypeDeniedError(
      lastErr instanceof Error && lastErr.message.startsWith("hmac_mismatch")
        ? "hmac_mismatch"
        : "document_type_denied",
    );
  }
}

// Re-export types for tests
export type { KycProvider };