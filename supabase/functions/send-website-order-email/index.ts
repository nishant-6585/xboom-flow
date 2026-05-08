/**
 * Sends customer-facing emails for website (WooCommerce) orders.
 *
 * Triggered by the `notify_website_order_email` DB trigger on the orders
 * table. Authenticates with X-Cron-Secret (validated against Vault via
 * the shared cron-auth helper). Sends through Resend from
 * `support@xboom.in`.
 *
 * Events handled:
 *  - order_received   (insert)
 *  - status_update    (any status change)
 *  - tracking_update  (tracking_number OR tracking_url changed)
 *  - delivered / cancelled / refunded
 */
import { isAuthorizedCron } from "../_shared/cron-auth.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FROM = "Xboom Orders <support@xboom.in>";

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

function buildEmail(b: Body): { subject: string; html: string } {
  const name = escapeHtml(b.customer_name || "Customer");
  const orderNo = escapeHtml(b.order_number || b.external_id || "");
  const product = escapeHtml(b.product_name || "your order");
  const total = b.total != null
    ? `₹${Math.round(Number(b.total)).toLocaleString("en-IN")}` : "";
  const status = escapeHtml(String(b.status || "").replace(/_/g, " "));
  const trackNum = escapeHtml(b.tracking_number || "");
  const trackUrl = b.tracking_url || "";
  const courier = escapeHtml(b.courier_name || "");
  const eta = b.estimated_delivery
    ? escapeHtml(new Date(b.estimated_delivery).toLocaleDateString("en-IN", {
        day: "numeric", month: "short", year: "numeric",
      }))
    : "";

  const head = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:560px;margin:0 auto;padding:24px;">
      <div style="text-align:center;margin-bottom:20px;">
        <h2 style="margin:0;color:#0ea5e9;">Xboom</h2>
      </div>`;
  const sig = `
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
      <p style="font-size:13px;color:#64748b">
        Need help? Reply to this email or write to
        <a href="mailto:support@xboom.in">support@xboom.in</a>.<br/>
        — Team Xboom
      </p>
    </div>`;

  switch (b.event) {
    case "order_received":
      return {
        subject: `Order #${orderNo} received — Xboom`,
        html: `${head}
          <h3>Hi ${name}, thanks for your order!</h3>
          <p>We've received your order <b>#${orderNo}</b> for <b>${product}</b>${total ? ` (${total})` : ""} and our team will start processing it shortly.</p>
          <p>You'll receive another email as soon as it ships.</p>
        ${sig}`,
      };
    case "tracking_update": {
      const detailRows = [
        courier   ? `<tr><td style="padding:6px 0;color:#64748b;font-size:13px;width:130px">Courier</td><td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:600">${courier}</td></tr>` : "",
        trackNum  ? `<tr><td style="padding:6px 0;color:#64748b;font-size:13px">Tracking number</td><td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:600">${trackNum}</td></tr>` : "",
        eta       ? `<tr><td style="padding:6px 0;color:#64748b;font-size:13px">Estimated delivery</td><td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:600">${eta}</td></tr>` : "",
      ].join("");
      return {
        subject: `Tracking details for order #${orderNo}`,
        html: `${head}
          <h3 style="margin:0 0 8px">Hi ${name}, your order is on the way 🚚</h3>
          <p style="margin:0 0 16px;color:#475569">Great news! Your order <b>#${orderNo}</b> (<b>${product}</b>) has been shipped${courier ? ` via <b>${courier}</b>` : ""}.</p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin:16px 0">
            <table style="width:100%;border-collapse:collapse">${detailRows}</table>
          </div>
          ${trackUrl ? `<p style="text-align:center;margin:20px 0"><a href="${trackUrl}" style="background:#0ea5e9;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600">Open ${courier || "courier"} tracking page</a></p>
          <p style="font-size:13px;color:#475569;margin:0 0 8px;text-align:center">On the page that opens, please enter your tracking number <b>${trackNum}</b> to view the latest status.</p>` : ""}
          <p style="font-size:13px;color:#64748b;margin-top:20px">Tracking information may take a few hours to reflect on the courier's website after dispatch.</p>
        ${sig}`,
      };
    }
    case "delivered":
      return {
        subject: `Order #${orderNo} delivered — Xboom`,
        html: `${head}
          <h3>Hi ${name}, your order has been delivered ✅</h3>
          <p>Order <b>#${orderNo}</b> (<b>${product}</b>) was marked delivered. We hope you love it!</p>
        ${sig}`,
      };
    case "cancelled":
      return {
        subject: `Order #${orderNo} cancelled`,
        html: `${head}
          <h3>Hi ${name},</h3>
          <p>Your order <b>#${orderNo}</b> has been cancelled. If this wasn't expected please reach out and we'll help you sort it.</p>
        ${sig}`,
      };
    case "refunded":
      return {
        subject: `Refund processed for order #${orderNo}`,
        html: `${head}
          <h3>Hi ${name},</h3>
          <p>Your refund for order <b>#${orderNo}</b> has been processed and should reflect in your account within 5-7 business days.</p>
        ${sig}`,
      };
    case "status_update":
    default:
      return {
        subject: `Update on your order #${orderNo}`,
        html: `${head}
          <h3>Hi ${name},</h3>
          <p>Your order <b>#${orderNo}</b> status was updated to <b>${status}</b>.</p>
        ${sig}`,
      };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Auth: cron secret validated against Vault (single source of truth).
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

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY missing" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { subject, html } = buildEmail(body);

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [body.customer_email],
      bcc: ["nishant.k@xboom.in"],
      subject,
      html,
      reply_to: "support@xboom.in",
      tags: [{ name: "category", value: "website_order" }, { name: "event", value: body.event }],
    }),
  });

  const text = await resp.text();
  if (!resp.ok) {
    console.error("[send-website-order-email] Resend error", resp.status, text);
    return new Response(JSON.stringify({ error: "Resend failed", details: text.slice(0, 500) }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ success: true, event: body.event }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});