// resend-pending-portal-invites
// Repair-sweep for pending customer confirmations. Two callers:
//   1. Daily cron (auth: x-cron-secret OR service-role bearer). Scans the
//      last 30 days of pending orders and re-invokes
//      `send-customer-confirmation-request` for anything eligible.
//   2. Admin UI on-demand (auth: admin/sales_manager JWT bearer). Same logic
//      but supports an optional `order_ids: string[]` body to target a
//      subset — this is the "immediate retry" path so operators don't have
//      to wait 24h for the cron tick.
//
// Response is a detailed per-order report:
//   { order_number, order_id, action, reason, template, notification_id,
//     http_status, requires_confirmation }
// so the caller (dashboard button, this-turn sweep, log-line) can render
// exactly what happened to each order without a second query.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

  // Auth: cron secret header OR service-role bearer OR admin/sales_manager JWT
  const auth = req.headers.get("Authorization") || "";
  const providedSecret = req.headers.get("x-cron-secret") || "";
  const isServiceRole = auth.includes(SERVICE);
  const isCron = CRON_SECRET && providedSecret === CRON_SECRET;
  let callerKind: "service" | "cron" | "admin" = isServiceRole ? "service" : isCron ? "cron" : "admin";
  if (!isServiceRole && !isCron) {
    // Admin UI path — validate JWT and gate to admin/sales_manager.
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ||
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    const bearer = auth.replace(/^Bearer\s+/i, "").trim();
    if (!bearer || !anonKey) return json({ error: "unauthorized" }, 401);
    const anon = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userRes } = await anon.auth.getUser(bearer);
    const uid = userRes?.user?.id;
    if (!uid) return json({ error: "unauthorized" }, 401);
    const svc = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
    const { data: roles } = await svc.from("user_roles").select("role").eq("user_id", uid);
    const rset = new Set((roles || []).map((r: any) => r.role));
    if (!(rset.has("admin") || rset.has("sales_manager"))) {
      return json({ error: "forbidden" }, 403);
    }
    callerKind = "admin";
  }

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  // Optional body: { order_ids?: string[] } — targeted immediate-retry mode.
  let targetIds: string[] | null = null;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({} as any));
      if (Array.isArray(body?.order_ids) && body.order_ids.length > 0) {
        targetIds = body.order_ids.filter((v: unknown) => typeof v === "string");
      }
    }
  } catch { /* ignore body parse */ }

  // Consider recent orders only to keep the job bounded; 30 days is well beyond
  // any reasonable dispatch window. Bypassed when the caller passed order_ids.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let query = admin
    .from("orders")
    .select("id, order_number, customer_email, status, confirmation_status, requires_confirmation, created_at, deleted_at")
    .eq("confirmation_status", "pending")
    .neq("status", "cancelled")
    .is("deleted_at", null)
    .not("customer_email", "is", null)
    .limit(200);
  if (targetIds && targetIds.length > 0) {
    query = query.in("id", targetIds);
  } else {
    query = query.gte("created_at", since);
  }
  const { data: orders, error } = await query;

  if (error) return json({ error: error.message }, 500);

  const nowIso = new Date().toISOString();
  interface ReportRow {
    order_id: string;
    order_number: string | null;
    action:
      | "resent"
      | "skip_has_portal"
      | "skip_live_invite"
      | "skip_throttled"
      | "skip_not_required"
      | "failed";
    reason: string;
    template: string | null;
    notification_id: string | null;
    http_status: number | null;
    requires_confirmation: boolean;
  }
  const results: ReportRow[] = [];

  for (const o of orders ?? []) {
    const email = (o as any).customer_email as string;
    const requiresConfirmation = (o as any).requires_confirmation === true;
    const push = (row: Omit<ReportRow, "order_id" | "order_number" | "requires_confirmation">) =>
      results.push({
        order_id: (o as any).id,
        order_number: (o as any).order_number ?? null,
        requires_confirmation: requiresConfirmation,
        ...row,
      });

    // Server-side mirror of the confirmation-endpoint guard. This function is
    // meant only for orders that still need the confirm-your-order email;
    // non-drone orders are handled by woo-mirror's portal-welcome path.
    if (!requiresConfirmation) {
      push({
        action: "skip_not_required",
        reason: "requires_confirmation=false — non-drone orders receive portal-welcome instead",
        template: null,
        notification_id: null,
        http_status: null,
      });
      continue;
    }

    // Skip if activated portal user exists
    const { data: contact } = await admin
      .from("portal_contacts")
      .select("auth_user_id")
      .ilike("email", email)
      .not("auth_user_id", "is", null)
      .maybeSingle();

    if (contact?.auth_user_id && !targetIds) {
      // Cron/sweep-all: portal user exists — customer just hasn't confirmed.
      // Nothing to fix from the invite side. When the admin explicitly asks
      // for these order_ids (targeted retry), fall through and re-send the
      // confirmation ask anyway.
      push({
        action: "skip_has_portal",
        reason: "customer already has an activated portal account",
        template: null,
        notification_id: null,
        http_status: null,
      });
      continue;
    }

    const { data: liveInvite } = await admin
      .from("portal_invite_tokens")
      .select("token")
      .ilike("email", email)
      .is("used_at", null)
      .gt("expires_at", nowIso)
      .maybeSingle();

    if (liveInvite && !targetIds) {
      push({
        action: "skip_live_invite",
        reason: "an unused portal invite is still live",
        template: null,
        notification_id: null,
        http_status: null,
      });
      continue;
    }

    // Throttle only the automated (cron/service) path. Admin-triggered targeted
    // retries always fire — the operator explicitly asked for it.
    if (callerKind !== "admin" || !targetIds) {
      const { data: recentAuto } = await admin
        .from("order_notifications")
        .select("id, sent_at")
        .eq("order_ref", (o as any).id)
        .eq("status_trigger", "auto_resend_invite")
        .gte("sent_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1)
        .maybeSingle();
      if (recentAuto) {
        push({
          action: "skip_throttled",
          reason: "auto-resend already fired within the last 24 hours",
          template: null,
          notification_id: null,
          http_status: null,
        });
        continue;
      }
    }

    try {
      // Route through send-customer-confirmation-request — it mints a portal
      // invite (idempotent) and includes the activation link alongside the
      // confirm link when needed.
      const r = await fetch(`${SUPABASE_URL}/functions/v1/send-customer-confirmation-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE}`,
          apikey: SERVICE,
        },
        body: JSON.stringify({ order_id: (o as any).id }),
      });
      const ok = r.ok;
      const { data: logRow } = await admin
        .from("order_notifications")
        .insert({
          order_ref: (o as any).id,
          order_source: "internal",
          order_number: o.order_number,
          status_trigger: "auto_resend_invite",
          channel: "email",
          template_name: "confirmation_request_email",
          payload: {
            reason: "sweep_repair",
            caller: callerKind,
            targeted: !!targetIds,
          },
          status: ok ? "sent" : "failed",
          sent_at: ok ? new Date().toISOString() : null,
          error_message: ok ? null : `send-customer-confirmation-request http ${r.status}`,
          provider: "platform",
        })
        .select("id")
        .single();
      push({
        action: ok ? "resent" : "failed",
        reason: ok
          ? "confirmation email dispatched via send-customer-confirmation-request"
          : `send-customer-confirmation-request returned http ${r.status}`,
        template: "customer-confirmation-request",
        notification_id: logRow?.id ?? null,
        http_status: r.status,
      });
    } catch (e) {
      push({
        action: "failed",
        reason: `invoke threw: ${(e as Error).message}`,
        template: "customer-confirmation-request",
        notification_id: null,
        http_status: null,
      });
    }
  }

  const summary = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.action] = (acc[r.action] ?? 0) + 1;
    return acc;
  }, {});
  return json({
    ok: true,
    caller: callerKind,
    targeted: !!targetIds,
    processed: results.length,
    summary,
    results,
  });
});
