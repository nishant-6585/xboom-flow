import { createClient } from "npm:@supabase/supabase-js@2";
import { isAuthorizedCron } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

/**
 * Outbound reconciliation: scans recent website-source internal orders and
 * pushes status changes back to WooCommerce when the two sides have
 * diverged. The DB trigger handles realtime pushes; this cron catches
 * misses (trigger errors, transient HTTP failures, manual DB edits).
 *
 * Auth: X-Cron-Secret header (vault-backed) OR admin/finance JWT.
 * Body / query: { days?: number, limit?: number, dry_run?: boolean }
 */

function targetWooStatus(o: Record<string, unknown>): string | null {
  const status = String(o.status ?? "");
  if (o.refund_status === "refunded") return "refunded";
  if (o.cancelled_at || status === "cancelled") return "cancelled";
  if (o.is_rto === true) return "cancelled";
  if (o.actual_delivery || status === "delivery_done") return "completed";
  if (status === "in_transit") return "shipped";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Auth: cron secret OR admin/finance JWT
  let authorized = await isAuthorizedCron(req);
  if (!authorized) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { data: userData } = await supabase.auth.getUser(token);
      if (userData?.user) {
        const { data: roles } = await supabase
          .from("user_roles").select("role").eq("user_id", userData.user.id);
        if ((roles || []).some((r: { role: string }) => r.role === "admin" || r.role === "finance")) {
          authorized = true;
        }
      }
    }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let days = 7;
  let limit = 200;
  let dryRun = false;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (typeof body?.days === "number" && body.days > 0 && body.days <= 60) days = body.days;
      if (typeof body?.limit === "number" && body.limit > 0 && body.limit <= 1000) limit = body.limit;
      if (body?.dry_run === true) dryRun = true;
    } catch { /* ignore */ }
  }

  const since = new Date(Date.now() - days * 86400_000).toISOString();

  // Fetch recently-updated website orders
  const { data: orders, error: oErr } = await supabase
    .from("orders")
    .select("id, external_id, status, refund_status, is_rto, cancelled_at, actual_delivery, customer_notes, updated_at")
    .eq("source", "website")
    .not("external_id", "is", null)
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (oErr) {
    return new Response(JSON.stringify({ error: oErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const externalIds = (orders || []).map((o) => String(o.external_id));
  let wooMap = new Map<string, string>();
  if (externalIds.length > 0) {
    const { data: wooRows } = await supabase
      .from("woocommerce_orders")
      .select("woo_order_id, order_status")
      .in("woo_order_id", externalIds);
    wooMap = new Map((wooRows || []).map((w: { woo_order_id: string; order_status: string }) =>
      [String(w.woo_order_id), String(w.order_status || "").toLowerCase()]
    ));
  }

  const wcUrl = Deno.env.get("WC_SITE_URL");
  const wcKey = Deno.env.get("WC_CONSUMER_KEY");
  const wcSecret = Deno.env.get("WC_CONSUMER_SECRET");
  if (!wcUrl || !wcKey || !wcSecret) {
    return new Response(JSON.stringify({ error: "WC credentials missing" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const base = wcUrl.replace(/\/$/, "");
  const auth = btoa(`${wcKey}:${wcSecret}`);

  const diverged: Array<{ order_id: string; external_id: string; from: string; to: string }> = [];
  let pushed = 0;
  let failed = 0;

  for (const o of orders || []) {
    const target = targetWooStatus(o as Record<string, unknown>);
    if (!target) continue;
    const currentWoo = wooMap.get(String(o.external_id)) || "";
    // Treat 'delivered' as already-completed on Woo (custom status).
    if (currentWoo === target) continue;
    if (target === "completed" && (currentWoo === "delivered" || currentWoo === "completed")) continue;

    diverged.push({
      order_id: o.id as string,
      external_id: String(o.external_id),
      from: currentWoo,
      to: target,
    });

    if (dryRun) continue;

    const wooBody: Record<string, unknown> = { status: target };
    if (target === "cancelled" && (o as Record<string, unknown>).is_rto === true) {
      const note = (o.customer_notes as string | null) || "";
      wooBody.customer_note = note ? `${note}\n[RTO]` : "[RTO] Return to origin";
    } else if (o.customer_notes) {
      wooBody.customer_note = o.customer_notes;
    }

    let ok = false;
    let lastErr = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const resp = await fetch(`${base}/wp-json/wc/v3/orders/${o.external_id}`, {
          method: "PUT",
          headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
          body: JSON.stringify(wooBody),
        });
        if (resp.ok) { ok = true; break; }
        lastErr = `HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : "fetch error";
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, 400 * attempt));
    }

    await supabase.from("woo_sync_logs").insert({
      woo_order_id: String(o.external_id),
      internal_order_id: o.id,
      event_type: "reverse_sync_cron",
      direction: "out",
      status: ok ? "success" : "failed",
      woo_status: target,
      error_message: ok ? null : lastErr,
      payload: wooBody,
    });
    if (ok) pushed++; else failed++;
  }

  return new Response(JSON.stringify({
    success: true,
    scanned: orders?.length ?? 0,
    diverged: diverged.length,
    pushed,
    failed,
    dry_run: dryRun,
    sample: diverged.slice(0, 20),
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});