// MSG91 SMS queue worker — mirrors send-order-status-whatsapp/index.ts.
// Drains pending `order_notifications` rows where channel='sms' and sends
// via the MSG91 Flow API. Cron-invoked OR manually invoked with
// { notification_id } for retry-from-UI (requires admin/supply_chain JWT).
//
//   Cron auth:    x-cron-secret header (validated via shared cron-auth helper)
//   Manual auth:  Authorization: Bearer <jwt>, role must be admin or supply_chain
//
// Atomic claim via claim_pending_notifications(_worker_id, _limit, _channel)
// guarantees no duplicate sends across workers.
//
// ============================================================================
// MSG91 FLOW SETUP — VARIABLE NAME CONTRACT
// ============================================================================
// The worker forwards `payload` keys to MSG91 as recipient-level variables
// verbatim (see buildMsg91Payload below). When ops creates a DLT-approved
// MSG91 Flow and pastes its flow_id into `notification_templates.template_id`,
// the Flow's variable names MUST match `notification_templates.variables`
// (and the keys produced by the per-surface DB triggers) exactly.
//
// MSG91 Flow variable names must match these exactly. Mismatches produce
// silently-empty substitutions in the delivered SMS — no error, no retry.
//
// Event types and the variables each Flow should declare:
//
//   created           : customer_name, order_number, amount
//   payment_received  : customer_name, order_number, amount
//   shipped           : customer_name, order_number, courier, tracking_number
//   delivered         : customer_name, order_number
//   cancelled         : customer_name, order_number
//
// Use these names — NOT VAR1 / VAR2 / ##name## — in the MSG91 Flow editor.
// The authoritative source for each event is `notification_templates.variables`
// for (event_type, provider='msg91').
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { isAuthorizedCron } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const MAX_RETRIES = 3;
const BATCH_SIZE = 20;
const BACKOFF_MIN: Record<number, number> = { 1: 2, 2: 5, 3: 15 };
const WORKER_ID = `worker-${crypto.randomUUID().slice(0, 8)}`;

interface NotificationRow {
  id: string;
  order_source: string;
  order_ref: string;
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
  provider: "msg91";
  template_id: string;
  language: string;
  variables: string[];
  is_active: boolean;
}

interface SendResult {
  ok: boolean;
  response: unknown;
  messageId?: string | null;
  error?: string;
}

// ---------------------------------------------------------------------------
// MSG91 PROVIDER
// ---------------------------------------------------------------------------

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  if (digits.length === 13 && digits.startsWith("091")) return digits.slice(1);
  return null;
}

async function sendMsg91(args: {
  flowId: string;
  phone: string;
  variables: Record<string, unknown>;
  senderId: string;
}): Promise<SendResult> {
  const authKey = Deno.env.get("MSG91_AUTH_KEY");
  if (!authKey) {
    return { ok: false, response: null, error: "MSG91_AUTH_KEY not configured" };
  }

  const mobile = normalizePhone(args.phone);
  if (!mobile) {
    return { ok: false, response: null, error: `Invalid phone: ${args.phone}` };
  }

  const recipient: Record<string, unknown> = { mobiles: mobile };
  for (const [k, v] of Object.entries(args.variables)) {
    recipient[k] = v === null || v === undefined ? "" : String(v);
  }

  const body: Record<string, unknown> = {
    template_id: args.flowId,
    short_url: "0",
    recipients: [recipient],
  };
  if (args.senderId) body.sender = args.senderId;

  try {
    const resp = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: {
        authkey: authKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 500) };
    }
    const j = json as { type?: string; message?: string; request_id?: string };

    if (!resp.ok || j?.type === "error") {
      return {
        ok: false,
        response: json,
        error: `MSG91 ${resp.status}: ${j?.message || "send failed"}`,
      };
    }
    return {
      ok: true,
      response: json,
      messageId: j?.request_id || null,
    };
  } catch (e) {
    return {
      ok: false,
      response: null,
      error: e instanceof Error ? e.message : "MSG91 request failed",
    };
  }
}

// ---------------------------------------------------------------------------
// TEMPLATE RESOLUTION
// ---------------------------------------------------------------------------

async function resolveTemplate(
  admin: ReturnType<typeof createClient>,
  eventType: string,
): Promise<TemplateRow | null> {
  const { data } = await admin
    .from("notification_templates")
    .select("id, event_type, provider, template_id, language, variables, is_active")
    .eq("event_type", eventType)
    .eq("provider", "msg91")
    .eq("is_active", true)
    .limit(1);
  const rows = (data || []) as TemplateRow[];
  return rows[0] || null;
}

function buildVariables(
  template: TemplateRow,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of template.variables) {
    out[name] = payload[name] ?? "";
  }
  return out;
}

// ---------------------------------------------------------------------------
// QUEUE PROCESSING
// ---------------------------------------------------------------------------

type Outcome = "sent" | "retry" | "failed" | "skipped";

async function processOne(
  admin: ReturnType<typeof createClient>,
  n: NotificationRow,
  senderId: string,
): Promise<{ id: string; outcome: Outcome; error?: string }> {
  const now = new Date();

  if (n.status === "sent") {
    return { id: n.id, outcome: "skipped" };
  }

  const template = await resolveTemplate(admin, n.status_trigger);
  if (!template) {
    await admin
      .from("order_notifications")
      .update({
        status: "failed",
        error_message: `No active msg91 template for event '${n.status_trigger}'`,
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
        provider: "msg91",
        template_id: template.id,
        locked_at: null,
        locked_by: null,
      })
      .eq("id", n.id);
    return { id: n.id, outcome: "failed", error: "No phone" };
  }

  let result: SendResult;
  try {
    result = await sendMsg91({
      flowId: template.template_id,
      phone: n.phone,
      variables: buildVariables(template, n.payload || {}),
      senderId,
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
        provider: "msg91",
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

  const nextRetry = n.retry_count + 1;
  const baseUpdate = {
    last_attempt_at: now.toISOString(),
    error_message: result.error || "Send failed",
    provider: "msg91",
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
// AUTH HELPERS
// ---------------------------------------------------------------------------

async function verifyAdminJwt(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) return false;
  const token = auth.slice(7).trim();
  if (!token) return false;

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error } = await userClient.auth.getUser();
  if (error || !userData?.user) return false;

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: isAdmin } = await admin.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (isAdmin === true) return true;
  const { data: isSupply } = await admin.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "supply_chain",
  });
  return isSupply === true;
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

  // Fail fast if MSG91 credentials are missing — no point claiming rows we can't send.
  const senderId = Deno.env.get("MSG91_SENDER_ID") || "";
  if (!Deno.env.get("MSG91_AUTH_KEY") || !senderId) {
    return new Response(
      JSON.stringify({
        error: "MSG91_AUTH_KEY and MSG91_SENDER_ID must be configured",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let body: { notification_id?: string; notification_ids?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const isManualRetry =
    !!body.notification_id ||
    (Array.isArray(body.notification_ids) && body.notification_ids.length > 0);

  // Auth: cron-secret OR admin/supply_chain JWT
  const cronOk = await isAuthorizedCron(req);
  if (!cronOk) {
    const jwtOk = await verifyAdminJwt(req);
    if (!jwtOk) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isManualRetry) {
      // Authenticated users may still only invoke for a specific id, not drain.
      return new Response(
        JSON.stringify({ error: "notification_id required for manual invoke" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let rows: NotificationRow[] = [];

  if (isManualRetry) {
    const ids = body.notification_id ? [body.notification_id] : body.notification_ids!;

    await admin
      .from("order_notifications")
      .update({
        status: "pending",
        next_attempt_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
      })
      .in("id", ids)
      .in("status", ["pending", "failed"])
      .eq("channel", "sms");

    const { data, error } = await admin.rpc("claim_pending_notifications", {
      _worker_id: WORKER_ID,
      _limit: ids.length,
      _channel: "sms",
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const idSet = new Set(ids);
    rows = ((data || []) as NotificationRow[]).filter((r) => idSet.has(r.id));
  } else {
    const { data, error } = await admin.rpc("claim_pending_notifications", {
      _worker_id: WORKER_ID,
      _limit: BATCH_SIZE,
      _channel: "sms",
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
        success: true,
        worker: WORKER_ID,
        processed: 0,
        sent: 0,
        retried: 0,
        failed: 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const results = { sent: 0, retried: 0, failed: 0, skipped: 0, errors: [] as string[] };
  for (const n of rows) {
    const r = await processOne(admin, n, senderId);
    if (r.outcome === "sent") results.sent++;
    else if (r.outcome === "retry") results.retried++;
    else if (r.outcome === "failed") results.failed++;
    else results.skipped++;
    if (r.error) results.errors.push(`${r.id}: ${r.error}`);
  }

  return new Response(
    JSON.stringify({
      success: true,
      worker: WORKER_ID,
      processed: rows.length,
      ...results,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});