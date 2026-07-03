import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const VERIFY_TOKEN = "xboom_fb_leads_2024";
const META_APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function verifyMetaSignature(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  if (!header || !secret) return false;
  const expectedPrefix = "sha256=";
  if (!header.startsWith(expectedPrefix)) return false;
  const providedHex = header.slice(expectedPrefix.length).toLowerCase();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (computed.length !== providedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ providedHex.charCodeAt(i);
  return diff === 0;
}

function extractField(fieldData: Array<{ name?: string; values?: string[] }> | undefined, key: string): string | null {
  if (!Array.isArray(fieldData)) return null;
  const want = key.toLowerCase();
  const row = fieldData.find((f) => (f?.name ?? "").toLowerCase() === want);
  const v = row?.values?.[0];
  return v && v.trim().length > 0 ? v.trim() : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Webhook verification handshake
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Reject if server not configured with Meta app secret
  if (!META_APP_SECRET) {
    console.error("facebook-leads-webhook: META_APP_SECRET not configured");
    return new Response(JSON.stringify({ error: "server not configured" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const validSig = await verifyMetaSignature(rawBody, signature, META_APP_SECRET);
  if (!validSig) {
    console.warn("facebook-leads-webhook: invalid or missing X-Hub-Signature-256");
    return new Response(JSON.stringify({ error: "invalid signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const value = body?.entry?.[0]?.changes?.[0]?.value ?? {};
    const fieldData = value?.field_data;

    const name = extractField(fieldData, "full_name");
    const phone = extractField(fieldData, "phone_number");
    const email = extractField(fieldData, "email");
    const formName: string | null = value?.form_name ?? null;

    const { error } = await supabase.from("leads").insert({
      form_type: "Facebook Leads",
      name,
      email,
      phone,
      subject: "Facebook Lead Form",
      message: formName,
      status: "new",
      submitted_at: new Date().toISOString(),
      payload: body,
    });

    if (error) {
      console.error("facebook-leads-webhook insert error", error);
      // Still return 200 to prevent FB from retrying on RLS/validation issues we can't fix from FB side.
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("facebook-leads-webhook error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});