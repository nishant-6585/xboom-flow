import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const VERIFY_TOKEN = "xboom_fb_leads_2024";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

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

  let body: any;
  try {
    body = await req.json();
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