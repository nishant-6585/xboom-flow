// resend-pending-portal-invites
// Daily cron: for each order with confirmation_status='pending' where the
// customer has no activated portal user OR no live unused invite, re-trigger
// kyc-handler onboardOrder(force=true) so a fresh invite + confirmation email
// goes out. Skips cancelled orders (kyc-handler enforces this defensively).
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

  // Auth: cron secret header OR service-role bearer
  const auth = req.headers.get("Authorization") || "";
  const providedSecret = req.headers.get("x-cron-secret") || "";
  const isServiceRole = auth.includes(SERVICE);
  const isCron = CRON_SECRET && providedSecret === CRON_SECRET;
  if (!isServiceRole && !isCron) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  // Consider recent orders only to keep the job bounded; 30 days is well beyond
  // any reasonable dispatch window.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: orders, error } = await admin
    .from("orders")
    .select("id, order_number, customer_email, status, confirmation_status, created_at")
    .eq("confirmation_status", "pending")
    .neq("status", "cancelled")
    .gte("created_at", since)
    .not("customer_email", "is", null)
    .limit(200);

  if (error) return json({ error: error.message }, 500);

  const nowIso = new Date().toISOString();
  const results: Array<Record<string, unknown>> = [];

  for (const o of orders ?? []) {
    const email = (o as any).customer_email as string;
    // Skip if activated portal user exists
    const { data: contact } = await admin
      .from("portal_contacts")
      .select("auth_user_id")
      .ilike("email", email)
      .not("auth_user_id", "is", null)
      .maybeSingle();

    let action: "skip_has_portal" | "skip_live_invite" | "resent" | "failed" = "resent";

    if (contact?.auth_user_id) {
      // Portal user exists — customer just hasn't confirmed. Nothing to fix
      // from the invite side; nudge handled elsewhere.
      results.push({ order: o.order_number, action: "skip_has_portal" });
      continue;
    }

    const { data: liveInvite } = await admin
      .from("portal_invite_tokens")
      .select("token")
      .ilike("email", email)
      .is("used_at", null)
      .gt("expires_at", nowIso)
      .maybeSingle();

    if (liveInvite) {
      results.push({ order: o.order_number, action: "skip_live_invite" });
      continue;
    }

    // Throttle: don't resend if we've auto-resent in the last 24h.
    const { data: recentAuto } = await admin
      .from("order_notifications")
      .select("id, sent_at")
      .eq("order_ref", (o as any).id)
      .eq("status_trigger", "auto_resend_invite")
      .gte("sent_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle();
    if (recentAuto) {
      results.push({ order: o.order_number, action: "skip_throttled" });
      continue;
    }

    try {
      // Route through send-customer-confirmation-request — it now mints a
      // portal invite (drone-agnostic) and includes the activation link
      // alongside the confirm link.
      const r = await fetch(`${SUPABASE_URL}/functions/v1/send-customer-confirmation-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE}`,
          apikey: SERVICE,
        },
        body: JSON.stringify({ order_id: (o as any).id }),
      });
      action = r.ok ? "resent" : "failed";
      await admin.from("order_notifications").insert({
        order_ref: (o as any).id,
        order_source: "internal",
        order_number: o.order_number,
        status_trigger: "auto_resend_invite",
        channel: "email",
        template_name: "confirmation_request_email",
        payload: { reason: "no_portal_user_or_expired_invite" },
        status: r.ok ? "sent" : "failed",
        sent_at: r.ok ? new Date().toISOString() : null,
        error_message: r.ok ? null : `send-customer-confirmation-request http ${r.status}`,
        provider: "platform",
      });
      results.push({ order: o.order_number, action, http: r.status });
    } catch (e) {
      results.push({ order: o.order_number, action: "failed", error: (e as Error).message });
    }
  }

  return json({ ok: true, processed: results.length, results });
});
