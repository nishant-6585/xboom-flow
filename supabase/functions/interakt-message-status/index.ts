// Interakt message-status webhook.
//
// Interakt calls this URL for every message lifecycle event
// (message_api_sent, message_dlvrd, message_read, message_failed ...).
// We persist a flat row per event so failed WhatsApp deliveries — e.g. the
// daily funnel report — are visible instead of silently disappearing after
// Interakt replies "queued for sending".
//
// Auth: optional shared secret via ?token=<INTERAKT_WEBHOOK_TOKEN>. Interakt
// cannot send custom headers, so the token lives in the query string.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Interakt can deliver its configured secret key in several shapes depending
  // on the dashboard version: ?token= / ?secret= in the URL, a header, or a
  // `secret` field in the JSON body. Accept any of them.
  const expected = Deno.env.get("INTERAKT_WEBHOOK_TOKEN");

  let payload: any = null;
  try { payload = await req.json(); } catch { /* ignore */ }

  if (expected) {
    const url = new URL(req.url);
    const candidates = [
      url.searchParams.get("token"),
      url.searchParams.get("secret"),
      url.searchParams.get("secret_key"),
      req.headers.get("secret-key"),
      req.headers.get("x-secret-key"),
      req.headers.get("x-interakt-secret"),
      req.headers.get("x-webhook-secret"),
      (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""),
      payload?.secret ?? payload?.secret_key ?? payload?.secretKey ?? null,
    ].filter(Boolean) as string[];

    if (!candidates.includes(expected)) {
      console.error("[interakt-message-status] unauthorized webhook call");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  if (!payload) {
    return new Response(JSON.stringify({ error: "invalid body" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const d = payload?.data ?? {};
  const message = d?.message ?? {};
  const customer = d?.customer ?? {};

  const status: string | null =
    message?.message_status ?? payload?.type ?? null;
  const failureReason: string | null =
    message?.failure_reason ?? message?.error_message ?? message?.error?.message ?? null;

  const row = {
    provider: "interakt",
    provider_message_id: message?.id ?? payload?.id ?? null,
    phone: customer?.phone_number
      ? `${customer?.country_code ?? ""}${customer.phone_number}`.replace(/\D/g, "")
      : (message?.receiver_phone_number ?? null),
    template_name: message?.template_name ?? message?.message_template_name ?? null,
    status,
    failure_reason: failureReason,
    callback_data: message?.callback_data ?? null,
    raw: payload,
  };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { error } = await supabase.from("whatsapp_message_events").insert(row);
  if (error) console.error("[interakt-message-status] insert failed:", error.message);

  if (status && /fail|undeliver/i.test(status)) {
    console.error(`[interakt-message-status] FAILED ${row.phone} ${row.template_name}: ${failureReason}`);
  }

  // Always 200 so Interakt does not retry indefinitely.
  return new Response(JSON.stringify({ received: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
