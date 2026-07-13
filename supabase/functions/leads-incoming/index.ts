// Public webhook receiver for WordPress (xboom.in) form submissions.
// Verifies optional HMAC-SHA256 signature, normalises payload, inserts into public.leads.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-xbm-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (clean.length % 2 !== 0) return new Uint8Array();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function verifyHmac(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  const match = signatureHeader.match(/^sha256=([a-fA-F0-9]+)$/);
  if (!match) return false;
  const expected = hexToBytes(match[1]);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  const computed = new Uint8Array(sigBuf);
  return timingSafeEqual(expected, computed);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "method not allowed" }, 405);
  }

  const rawBody = await req.text();

  // Mandatory HMAC verification — reject if secret is unset or signature missing/invalid
  const sigHeader = req.headers.get("x-xbm-signature");
  const secret = Deno.env.get("XBM_WEBHOOK_SECRET");
  if (!secret) {
    console.error("[leads-incoming] XBM_WEBHOOK_SECRET not configured");
    return json({ ok: false, error: "server misconfigured" }, 500);
  }
  if (!sigHeader) {
    return json({ ok: false, error: "missing signature" }, 401);
  }
  const sigOk = await verifyHmac(rawBody, sigHeader, secret);
  if (!sigOk) return json({ ok: false, error: "invalid signature" }, 401);

  // Parse JSON
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }
  if (!body || typeof body !== "object") {
    return json({ ok: false, error: "body must be an object" }, 400);
  }

  const payload = (body.payload && typeof body.payload === "object") ? body.payload : {};

  // Normalise email/phone (top-level OR inside payload)
  const email = (body.email ?? payload.email ?? "").toString().trim();
  const phone = (body.phone ?? payload.phone ?? "").toString().trim();
  if (!email && !phone) {
    return json(
      { ok: false, error: "either email or phone is required" },
      400,
    );
  }

  // Resolve company from organisation/institution if blank
  const companyRaw = (body.company ?? "").toString().trim();
  const company = companyRaw
    || (payload.organisation ?? "").toString().trim()
    || (payload.institution ?? "").toString().trim()
    || null;

  const row = {
    source:       body.source ?? 'Website',
    form_type:    body.form_type ?? null,
    name:         body.name ?? null,
    email:        email || null,
    phone:        phone || null,
    company,
    subject:      body.subject ?? null,
    message:      body.message ?? null,
    location:     payload.location ?? null,
    role:         payload.role ?? null,
    urgency:      payload.urgency ?? null,
    sector:       payload.sector ?? null,
    page_url:     body.page_url ?? null,
    ip:           body.ip ?? req.headers.get("x-forwarded-for") ?? null,
    user_agent:   body.user_agent ?? req.headers.get("user-agent") ?? null,
    submitted_at: body.submitted_at ?? null,
    payload,
    destinations: body.destinations ?? null,
    status:       "new",
  };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase
    .from("leads")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    console.error("[leads-incoming] insert failed", error);
    return json({ ok: false, error: "insert_failed" }, 500);
  }

  return json({ ok: true, id: data.id });
});