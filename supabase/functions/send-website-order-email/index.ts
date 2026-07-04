/**
 * Sends customer-facing emails for website (WooCommerce) orders.
 *
 * Triggered by the `notify_website_order_email` DB trigger on the orders
 * table. Authenticates with X-Cron-Secret (validated against Vault via
 * the shared cron-auth helper).
 *
 * Migrated to the platform queue: the seam renders the registered
 * `website-order` React Email template and enqueues via
 * send-transactional-email. Copy/subjects are byte-for-byte preserved.
 *
 * Events handled:
 *  - order_received   (insert)
 *  - status_update    (any status change)
 *  - tracking_update  (tracking_number OR tracking_url changed)
 *  - delivered / cancelled / refunded
 */
import { isAuthorizedCron } from "../_shared/cron-auth.ts";
import { sendEmail } from "../_shared/email.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface Body {
  order_id: string;
  event: string;
  customer_email: string;
  customer_name?: string | null;
  order_number?: string | null;
  product_name?: string | null;
  total?: number | null;
  status?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  courier_name?: string | null;
  estimated_delivery?: string | null;
  shipping_address?: string | null;
  external_id?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (!(await isAuthorizedCron(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let body: Body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (!body.customer_email || !body.event) {
    return new Response(JSON.stringify({ error: "Missing email or event" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Stable idempotency identity: mirrors the DB order_notifications row for
  // this send. Used both for the queue payload AND for the caller-side
  // short-circuit below.
  const idempotencyKey = `woo:${body.order_id}:${body.event}:email`;

  // ---- Dedup short-circuit -----------------------------------------------
  // The platform queue's `idempotency_key` is metadata — it is NOT enforced
  // at enqueue time. When upstream is backed off (e.g., 429), a repeat
  // trigger source (like a WooCommerce webhook loop) can flood the queue
  // with hundreds of identical messages before any of them dispatch.
  // Refuse to re-enqueue if a prior send for this idempotency_key already
  // exists in email_send_log within the recent window (sent, pending, or
  // suppressed — anything except a hard failure that we'd want to retry).
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: prior } = await supabase
      .from("email_send_log")
      .select("id, status, created_at")
      .eq("template_name", "website-order")
      .eq("recipient_email", body.customer_email)
      .contains("metadata", { idempotency_key: idempotencyKey })
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .in("status", ["sent", "pending", "suppressed"])
      .limit(1);
    if (prior && prior.length > 0) {
      console.log("[send-website-order-email] Skipping duplicate", {
        idempotencyKey,
        prior_status: prior[0].status,
      });
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "duplicate_idempotency_key" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (e) {
    // Fail open — if the dedup lookup errors, still send. Better one
    // duplicate than a missed cancellation notice.
    console.warn("[send-website-order-email] Dedup lookup failed, proceeding", e);
  }

  const resp = await sendEmail({
    to: body.customer_email,
    subject: "", // template owns the subject (subjectFor(event))
    html: "",   // template owns rendering
    provider: "platform",
    templateName: "website-order",
    idempotencyKey,
    templateData: {
      event: body.event,
      customer_name: body.customer_name,
      order_number: body.order_number,
      external_id: body.external_id,
      product_name: body.product_name,
      total: body.total,
      status: body.status,
      tracking_number: body.tracking_number,
      tracking_url: body.tracking_url,
      courier_name: body.courier_name,
      estimated_delivery: body.estimated_delivery,
    },
  });

  if (!resp.ok) {
    console.error("[send-website-order-email] Email error", resp.status, resp.error);
    return new Response(JSON.stringify({ error: "Email failed", details: (resp.error ?? "").slice(0, 500) }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ success: true, event: body.event, provider: resp.provider }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});