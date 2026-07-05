// Queue worker: drains pending order_notifications rows and attempts delivery
// via the WhatsApp provider. Designed to be invoked by pg_cron every 2 minutes
// or manually via { notification_id } for retry-from-UI.
//
// Provider abstraction:
//   sendWhatsApp({ provider, templateId, phone, variables })
// routes to either Interakt or Meta WABA, both modular and swappable.
// Atomic claim via claim_pending_notifications() RPC ensures no duplicate sends.

import { createClient } from "npm:@supabase/supabase-js@2";
import { isAuthorizedCron } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_RETRIES = 3;
const BATCH_SIZE = 20;
// retry_count is incremented BEFORE scheduling the next attempt:
//   1st failure → retry_count=1 → wait 2 min
//   2nd failure → retry_count=2 → wait 5 min
//   3rd failure → retry_count=3 → terminal 'failed'
const BACKOFF_MIN: Record<number, number> = { 1: 2, 2: 5, 3: 15 };

const WORKER_ID = `worker-${crypto.randomUUID().slice(0, 8)}`;

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
  status: string;
  provider: string | null;
}

interface TemplateRow {
  id: string;
  event_type: string;
  provider: "interakt" | "meta";
  template_id: string;
  language: string;
  variables: string[];
  is_active: boolean;
}

interface SendArgs {
  provider: "interakt" | "meta";
  templateId: string;
  phone: string;
  variables: Record<string, unknown>;
  language?: string;
}

interface SendResult {
  ok: boolean;
  response: unknown;
  messageId?: string | null;
  error?: string;
}

// ---------------------------------------------------------------------------
// PROVIDER MODULES
// ---------------------------------------------------------------------------

/**
 * Interakt WABA: https://www.interakt.shop/resource-center/developer-docs/
 * POST https://api.interakt.ai/v1/public/message/
 * Headers: Authorization: Basic <API_KEY base64>  (Interakt issues already-base64 keys)
 */
async function sendInterakt(args: SendArgs): Promise<SendResult> {
  const apiKey = Deno.env.get("INTERAKT_API_KEY");
  if (!apiKey) {
    return { ok: false, response: null, error: "INTERAKT_API_KEY not configured" };
  }

  // Strip any non-digit chars; Interakt accepts countryCode + phoneNumber separately.
  const digits = String(args.phone).replace(/\D/g, "");
  if (digits.length < 10) {
    return { ok: false, response: null, error: `Invalid phone: ${args.phone}` };
  }
  // Default to India if 10 digits, else assume the leading digits are the country code.
  const countryCode = digits.length === 10 ? "91" : digits.slice(0, digits.length - 10);
  const phoneNumber = digits.slice(-10);

  // Interakt expects bodyValues as an ordered array of stringified vars.
  // The template's `variables` jsonb is the canonical order.
  const bodyValues = Array.isArray(args.variables)
    ? (args.variables as unknown[]).map((v) => String(v ?? ""))
    : Object.values(args.variables).map((v) => String(v ?? ""));

  const payload = {
    countryCode,
    phoneNumber,
    callbackData: `order_notification_${Date.now()}`,
    type: "Template",
    template: {
      name: args.templateId,
      languageCode: args.language || "en",
      bodyValues,
    },
  };

  try {
    const resp = await fetch("https://api.interakt.ai/v1/public/message/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const text = await resp.text();
    let json: any;
    try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 500) }; }

    if (!resp.ok || json?.result === false) {
      return {
        ok: false,
        response: json,
        error: `Interakt ${resp.status}: ${json?.message || json?.error || "send failed"}`,
      };
    }
    return {
      ok: true,
      response: json,
      messageId: json?.id || json?.data?.id || json?.messageId || null,
    };
  } catch (e) {
    return {
      ok: false,
      response: null,
      error: e instanceof Error ? e.message : "Interakt request failed",
    };
  }
}

/**
 * Meta WABA Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api
 * POST https://graph.facebook.com/v20.0/{phone-number-id}/messages
 */
async function sendMeta(args: SendArgs): Promise<SendResult> {
  const token = Deno.env.get("META_WABA_TOKEN");
  const phoneId = Deno.env.get("META_WABA_PHONE_NUMBER_ID");
  if (!token || !phoneId) {
    return {
      ok: false,
      response: null,
      error: "META_WABA_TOKEN / META_WABA_PHONE_NUMBER_ID not configured",
    };
  }

  const digits = String(args.phone).replace(/\D/g, "");
  if (digits.length < 10) {
    return { ok: false, response: null, error: `Invalid phone: ${args.phone}` };
  }
  const to = digits.length === 10 ? `91${digits}` : digits;

  const params = (Array.isArray(args.variables)
    ? (args.variables as unknown[])
    : Object.values(args.variables)
  ).map((v) => ({ type: "text", text: String(v ?? "") }));

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: args.templateId,
      language: { code: args.language || "en" },
      components: params.length > 0 ? [{ type: "body", parameters: params }] : [],
    },
  };

  try {
    const resp = await fetch(
      `https://graph.facebook.com/v20.0/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      },
    );
    const text = await resp.text();
    let json: any;
    try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 500) }; }

    if (!resp.ok || json?.error) {
      return {
        ok: false,
        response: json,
        error: `Meta ${resp.status}: ${json?.error?.message || "send failed"}`,
      };
    }
    return {
      ok: true,
      response: json,
      messageId: json?.messages?.[0]?.id || null,
    };
  } catch (e) {
    return {
      ok: false,
      response: null,
      error: e instanceof Error ? e.message : "Meta request failed",
    };
  }
}

/**
 * Provider router.
 */
async function sendWhatsApp(args: SendArgs): Promise<SendResult> {
  switch (args.provider) {
    case "interakt": return sendInterakt(args);
    case "meta":     return sendMeta(args);
    default:
      return { ok: false, response: null, error: `Unknown provider: ${args.provider}` };
  }
}

// ---------------------------------------------------------------------------
// TEMPLATE RESOLUTION
// ---------------------------------------------------------------------------

async function resolveTemplate(
  admin: ReturnType<typeof createClient>,
  eventType: string,
): Promise<TemplateRow | null> {
  // Active templates only; if both providers are active we prefer Interakt.
  const { data } = await admin
    .from("notification_templates")
    .select("id, event_type, provider, template_id, language, variables, is_active")
    .eq("event_type", eventType)
    .eq("is_active", true)
    .order("provider", { ascending: true }); // 'interakt' < 'meta' alphabetically
  const rows = (data || []) as TemplateRow[];
  return rows[0] || null;
}

/**
 * Map a notification's payload (object) to the ordered variable list required
 * by the template definition.
 */
function buildVariables(
  template: TemplateRow,
  payload: Record<string, unknown>,
): unknown[] {
  return template.variables.map((name) => payload[name] ?? "");
}

// ---------------------------------------------------------------------------
// QUEUE PROCESSING
// ---------------------------------------------------------------------------

async function processOne(
  admin: ReturnType<typeof createClient>,
  n: NotificationRow,
): Promise<{ id: string; outcome: "sent" | "retry" | "failed" | "skipped"; error?: string }> {
  const now = new Date();

  // SAFETY: never re-send a row that's already 'sent' (defence-in-depth on top
  // of the atomic claim).
  if (n.status === "sent") {
    return { id: n.id, outcome: "skipped" };
  }

  // Resolve template + provider
  const template = await resolveTemplate(admin, n.status_trigger);
  if (!template) {
    await admin
      .from("order_notifications")
      .update({
        status: "failed",
        error_message: `No active template for event '${n.status_trigger}'`,
        retry_count: MAX_RETRIES,
        last_attempt_at: now.toISOString(),
        locked_at: null,
        locked_by: null,
      })
      .eq("id", n.id);
    return { id: n.id, outcome: "failed", error: "No active template" };
  }

  if (!n.phone) {
    await admin
      .from("order_notifications")
      .update({
        status: "failed",
        error_message: "No phone number on order",
        retry_count: MAX_RETRIES,
        last_attempt_at: now.toISOString(),
        provider: template.provider,
        template_id: template.id,
        locked_at: null,
        locked_by: null,
      })
      .eq("id", n.id);
    return { id: n.id, outcome: "failed", error: "No phone" };
  }

  // Send
  let result: SendResult;
  try {
    result = await sendWhatsApp({
      provider: template.provider,
      templateId: template.template_id,
      phone: n.phone,
      variables: buildVariables(template, n.payload || {}),
      language: template.language,
    });
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
        provider: template.provider,
        template_id: template.id,
        provider_message_id: result.messageId ?? null,
        provider_response: result.response,
        error_message: null,
        locked_at: null,
        locked_by: null,
      })
      .eq("id", n.id);
    return { id: n.id, outcome: "sent" };
  }

  // Failure path
  const nextRetry = n.retry_count + 1;
  const baseUpdate = {
    last_attempt_at: now.toISOString(),
    error_message: result.error || "Send failed",
    provider: template.provider,
    template_id: template.id,
    provider_response: result.response,
    locked_at: null,
    locked_by: null,
  };

  if (nextRetry >= MAX_RETRIES) {
    await admin
      .from("order_notifications")
      .update({ ...baseUpdate, status: "failed", retry_count: nextRetry })
      .eq("id", n.id);
    return { id: n.id, outcome: "failed", error: result.error };
  }

  const waitMin = BACKOFF_MIN[nextRetry] ?? 15;
  const next = new Date(now.getTime() + waitMin * 60_000);
  await admin
    .from("order_notifications")
    .update({
      ...baseUpdate,
      status: "pending",
      retry_count: nextRetry,
      next_attempt_at: next.toISOString(),
    })
    .eq("id", n.id);
  return { id: n.id, outcome: "retry", error: result.error };
}

// ---------------------------------------------------------------------------
// HTTP ENTRY POINT
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Authorization: accept a cron secret OR an admin/sales_manager/supply_chain
  // JWT. Prevents anonymous callers from force-processing / resending
  // WhatsApp notifications to real customers.
  const supabaseUrlEarly = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKeyEarly = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKeyEarly = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const authHeaderEarly = req.headers.get("Authorization") || "";
  const bearer = authHeaderEarly.replace(/^Bearer\s+/i, "").trim();
  let authorized = await isAuthorizedCron(req);
  if (!authorized && bearer && bearer === serviceRoleKeyEarly) authorized = true;
  if (!authorized && bearer) {
    try {
      const userClient = createClient(supabaseUrlEarly, anonKeyEarly, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const adminClient = createClient(supabaseUrlEarly, serviceRoleKeyEarly);
        const { data: roles } = await adminClient
          .from("user_roles").select("role").eq("user_id", user.id);
        const allowed = new Set(["admin", "sales_manager", "supply_chain"]);
        if ((roles ?? []).some((r: { role: string }) => allowed.has(r.role))) authorized = true;
      }
    } catch (_e) { /* fall through */ }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: { notification_id?: string; notification_ids?: string[] } = {};
  try { body = await req.json(); } catch { body = {}; }

  let rows: NotificationRow[] = [];

  // -------------------------------------------------------
  // Manual single / bulk retry mode
  // -------------------------------------------------------
  if (body.notification_id || (body.notification_ids && body.notification_ids.length > 0)) {
    const ids = body.notification_id
      ? [body.notification_id]
      : body.notification_ids!;

    // Reset to pending so the worker treats them as eligible — only failed/pending
    // rows are re-enqueueable, never 'sent'.
    await admin
      .from("order_notifications")
      .update({
        status: "pending",
        next_attempt_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
      })
      .in("id", ids)
      .in("status", ["pending", "failed"]);

    // Now atomically claim them
    const { data, error } = await admin.rpc("claim_pending_notifications", {
      _worker_id: WORKER_ID,
      _limit: ids.length,
      _channel: "whatsapp",
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Filter to only the requested ids (claim may pick up others if they happen
    // to be due at the same instant)
    const idSet = new Set(ids);
    rows = ((data || []) as NotificationRow[]).filter((r) => idSet.has(r.id));
  } else {
    // -------------------------------------------------------
    // Cron drain mode: atomic batch claim
    // -------------------------------------------------------
    const { data, error } = await admin.rpc("claim_pending_notifications", {
      _worker_id: WORKER_ID,
      _limit: BATCH_SIZE,
      _channel: "whatsapp",
    });
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
      JSON.stringify({
        success: true, worker: WORKER_ID, processed: 0, sent: 0, retried: 0, failed: 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const results = { sent: 0, retried: 0, failed: 0, skipped: 0, errors: [] as string[] };
  for (const n of rows) {
    const r = await processOne(admin, n);
    if (r.outcome === "sent") results.sent++;
    else if (r.outcome === "retry") results.retried++;
    else if (r.outcome === "failed") results.failed++;
    else results.skipped++;
    if (r.error) results.errors.push(`${r.id}: ${r.error}`);
  }

  return new Response(
    JSON.stringify({ success: true, worker: WORKER_ID, processed: rows.length, ...results }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
