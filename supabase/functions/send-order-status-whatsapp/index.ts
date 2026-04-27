// Queue worker: drains pending order_notifications rows and attempts delivery
// via the WhatsApp provider. Designed to be invoked by pg_cron every 2 minutes
// or manually via { notification_id } for retry-from-UI.
//
// Provider is currently STUBBED — replace `sendViaProvider` when the WABA
// provider (Interakt / Meta) is wired up. The queue contract stays identical.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_RETRIES = 3;
const BATCH_SIZE = 20;
// retry_count is incremented BEFORE scheduling the next attempt, so:
//   after 1st failure → retry_count=1 → wait 2 min  (BACKOFF_MIN[1])
//   after 2nd failure → retry_count=2 → wait 5 min  (BACKOFF_MIN[2])
//   after 3rd failure → retry_count=3 → terminal 'failed'
const BACKOFF_MIN: Record<number, number> = { 1: 2, 2: 5, 3: 15 };

interface NotificationRow {
  id: string;
  woo_order_id: string;
  order_number: string | null;
  status_trigger: string;
  channel: string;
  phone: string | null;
  template_name: string;
  payload: Record<string, unknown>;
  retry_count: number;
}

interface SendResult {
  ok: boolean;
  response: unknown;
  error?: string;
}

// ---------------------------------------------------------------------------
// Provider stub. Returns ok=true if a phone is present (so the queue can be
// exercised end-to-end). Replace with a real fetch() call to the WABA provider.
// ---------------------------------------------------------------------------
async function sendViaProvider(n: NotificationRow): Promise<SendResult> {
  if (!n.phone) {
    return { ok: false, response: null, error: "No phone number on order" };
  }
  console.log(
    `[whatsapp] STUB send template=${n.template_name} order=${n.woo_order_id} phone=${n.phone}`,
  );
  // Pretend success — provider integration is intentionally deferred.
  return {
    ok: true,
    response: {
      stub: true,
      template: n.template_name,
      to: n.phone,
      sent_at: new Date().toISOString(),
    },
  };
}

async function processOne(
  admin: ReturnType<typeof createClient>,
  n: NotificationRow,
): Promise<{ id: string; outcome: "sent" | "retry" | "failed"; error?: string }> {
  const now = new Date();
  let result: SendResult;
  try {
    result = await sendViaProvider(n);
  } catch (e) {
    result = {
      ok: false,
      response: null,
      error: e instanceof Error ? e.message : "Provider call threw",
    };
  }

  if (result.ok) {
    await admin
      .from("order_notifications")
      .update({
        status: "sent",
        sent_at: now.toISOString(),
        last_attempt_at: now.toISOString(),
        provider_response: result.response,
        error_message: null,
      })
      .eq("id", n.id);
    return { id: n.id, outcome: "sent" };
  }

  // Failure path
  const nextRetry = n.retry_count + 1;
  if (nextRetry >= MAX_RETRIES) {
    await admin
      .from("order_notifications")
      .update({
        status: "failed",
        retry_count: nextRetry,
        last_attempt_at: now.toISOString(),
        error_message: result.error || "Send failed",
        provider_response: result.response,
      })
      .eq("id", n.id);
    return { id: n.id, outcome: "failed", error: result.error };
  }

  const waitMin = BACKOFF_MIN[nextRetry] ?? 15;
  const next = new Date(now.getTime() + waitMin * 60_000);
  await admin
    .from("order_notifications")
    .update({
      status: "pending",
      retry_count: nextRetry,
      last_attempt_at: now.toISOString(),
      next_attempt_at: next.toISOString(),
      error_message: result.error || "Send failed",
      provider_response: result.response,
    })
    .eq("id", n.id);
  return { id: n.id, outcome: "retry", error: result.error };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: { notification_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Manual single-row mode (used by "Retry WhatsApp" button on the order card)
  let rows: NotificationRow[] = [];
  if (body.notification_id) {
    const { data, error } = await admin
      .from("order_notifications")
      .select(
        "id, woo_order_id, order_number, status_trigger, channel, phone, template_name, payload, retry_count",
      )
      .eq("id", body.notification_id)
      .in("status", ["pending", "failed"])
      .limit(1);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    rows = (data || []) as NotificationRow[];
    // Manual retry resets the schedule so the worker doesn't ignore it
    if (rows.length > 0) {
      await admin
        .from("order_notifications")
        .update({ status: "pending", next_attempt_at: new Date().toISOString() })
        .eq("id", rows[0].id);
    }
  } else {
    // Cron drain mode
    const { data, error } = await admin
      .from("order_notifications")
      .select(
        "id, woo_order_id, order_number, status_trigger, channel, phone, template_name, payload, retry_count",
      )
      .eq("status", "pending")
      .lte("next_attempt_at", new Date().toISOString())
      .order("next_attempt_at", { ascending: true })
      .limit(BATCH_SIZE);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    rows = (data || []) as NotificationRow[];
  }

  if (rows.length === 0) {
    return new Response(
      JSON.stringify({ success: true, processed: 0, sent: 0, retried: 0, failed: 0 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Process sequentially so we don't blast the provider; the batch is small.
  const results: { sent: number; retried: number; failed: number; errors: string[] } = {
    sent: 0,
    retried: 0,
    failed: 0,
    errors: [],
  };
  for (const n of rows) {
    const r = await processOne(admin, n);
    if (r.outcome === "sent") results.sent++;
    else if (r.outcome === "retry") results.retried++;
    else results.failed++;
    if (r.error) results.errors.push(`${r.id}: ${r.error}`);
  }

  return new Response(
    JSON.stringify({ success: true, processed: rows.length, ...results }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});