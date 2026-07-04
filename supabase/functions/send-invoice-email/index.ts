import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Body {
  invoice_id: string;
  to_email?: string;
  mode?: "auto" | "manual" | "skip";
  bypass_reason?: string;
  force?: boolean;
}

const escapeHtml = (s: string) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n || 0);

const FROM = "Xboom Utilities <invoices@xboom.in>";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    // Auth: either a valid user JWT (admin/finance/supply_chain/sales_manager)
    // OR a valid cron secret (used by zoho-invoice-poller for auto-sends).
    const cronSecret = req.headers.get("x-cron-secret") ?? req.headers.get("X-Cron-Secret");
    const expectedCron =
      Deno.env.get("CRON_SECRET") ?? Deno.env.get("ZOHO_SYNC_CRON_SECRET");
    const isCronCall = !!(cronSecret && expectedCron && cronSecret === expectedCron);

    let userId: string | null = null;
    if (!isCronCall) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
      userId = (claimsData?.claims?.sub as string | undefined) ?? null;
      if (claimsErr || !userId) {
        console.error("JWT verification failed:", claimsErr);
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (!isCronCall && userId) {
      // Role check — only finance/admin/supply_chain/sales_manager may send invoice PDFs.
      const { data: roles } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      const ALLOWED_ROLES = ["admin", "finance", "supply_chain", "sales_manager"];
      if (!roles?.some((r: { role: string }) => ALLOWED_ROLES.includes(r.role))) {
        console.warn("Forbidden invoice email attempt by user", userId);
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = (await req.json()) as Body;
    if (!body?.invoice_id) {
      return new Response(JSON.stringify({ error: "invoice_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load invoice row
    const { data: inv, error: invErr } = await admin
      .from("order_invoices")
      .select("*")
      .eq("id", body.invoice_id)
      .maybeSingle();
    if (invErr || !inv) throw new Error("Invoice not found");

    const docType: "proforma" | "tax_invoice" =
      inv.document_type === "proforma" ? "proforma" : "tax_invoice";

    // Load order context for to_email + order number/total
    let orderNumber = "";
    let customerName = "";
    // SECURITY: ignore client-supplied to_email; always derive recipient from the
    // order record on the server. This prevents exfiltration of invoice PDFs to
    // arbitrary addresses.
    let customerEmail = "";
    let total = Number(inv.total || 0);

    if (inv.order_id) {
      const { data: o } = await admin
        .from("orders")
        .select("order_number,customer_name,customer_email,total_sales_amount")
        .eq("id", inv.order_id)
        .maybeSingle();
      if (o) {
        orderNumber = o.order_number || "";
        customerName = o.customer_name || "";
        customerEmail = (o.customer_email || "").trim();
        if (!total) total = Number(o.total_sales_amount || 0);
      }
    } else if (inv.woocommerce_order_id) {
      const { data: w } = await admin
        .from("woocommerce_orders")
        .select("order_number,woo_order_id,customer_name,customer_email,total_sales_amount")
        .eq("id", inv.woocommerce_order_id)
        .maybeSingle();
      if (w) {
        orderNumber = w.order_number || w.woo_order_id || "";
        customerName = w.customer_name || "";
        customerEmail = (w.customer_email || "").trim();
        if (!total) total = Number(w.total_sales_amount || 0);
      }
    }

    // If the caller supplied a to_email, it MUST match the on-file customer
    // email (case-insensitive). Mismatches are treated as exfiltration attempts.
    if (body.to_email && body.to_email.trim().toLowerCase() !== customerEmail.toLowerCase()) {
      console.warn("Rejected to_email override for invoice", body.invoice_id, "by user", userId);
      return new Response(
        JSON.stringify({ error: "to_email must match the customer email on file" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const logBase = {
      order_id: inv.order_id,
      woocommerce_order_id: inv.woocommerce_order_id,
      invoice_id: inv.id,
      doc_type: docType,
      sent_by: userId,
    };

    // SKIP path
    if (body.mode === "skip") {
      await admin.from("invoice_email_log").insert({
        ...logBase,
        to_email: null,
        status: "skipped",
        bypass_reason: body.bypass_reason || "Skipped by user",
      });
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency for auto mode: skip if already sent
    if (body.mode !== "manual" && !body.force) {
      const { data: prior } = await admin
        .from("invoice_email_log")
        .select("id,status")
        .eq("invoice_id", inv.id)
        .eq("status", "sent")
        .limit(1);
      if (prior && prior.length > 0) {
        return new Response(JSON.stringify({ ok: true, deduped: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Validate email
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!customerEmail || !emailRe.test(customerEmail)) {
      await admin.from("invoice_email_log").insert({
        ...logBase,
        to_email: customerEmail || null,
        status: "failed",
        error: "Missing or invalid customer email",
      });
      return new Response(JSON.stringify({ error: "Missing or invalid customer email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download PDF
    const { data: file, error: dlErr } = await admin.storage
      .from("invoices")
      .download(inv.storage_path);
    if (dlErr || !file) {
      await admin.from("invoice_email_log").insert({
        ...logBase, to_email: customerEmail, status: "failed",
        error: `Download failed: ${dlErr?.message || "unknown"}`,
      });
      throw new Error("Failed to download invoice PDF");
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    // base64 encode
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const b64 = btoa(bin);

    const invNum = inv.invoice_number || inv.file_name || "Invoice";
    const label = docType === "proforma" ? "Proforma Invoice" : "Tax Invoice";
    const subject =
      docType === "proforma"
        ? `Proforma Invoice ${invNum} for Order ${orderNumber} — ${fmtINR(total)}`
        : `Tax Invoice ${invNum} for Order ${orderNumber} — ${fmtINR(total)}`;

    const greeting = customerName ? `Dear ${escapeHtml(customerName)},` : "Hello,";
    const intro =
      docType === "proforma"
        ? `Please find attached the <b>Proforma Invoice</b> for your order <b>${escapeHtml(orderNumber)}</b>.
           This document confirms the agreed pricing and is intended for advance payment/reference.
           A final GST Tax Invoice will be shared once the order is dispatched.`
        : `Please find attached the <b>Tax Invoice</b> (final GST invoice) for your order <b>${escapeHtml(orderNumber)}</b>.
           This is the official tax document and <b>supersedes any earlier proforma invoice</b> shared for this order.`;

    const html = `
      <div style="font-family:Arial,sans-serif;color:#222;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:#0f172a;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:20px;">${label} — ${escapeHtml(invNum)}</h2>
          <p style="margin:4px 0 0;color:#cbd5e1;font-size:13px;">Order ${escapeHtml(orderNumber)} · ${fmtINR(total)}</p>
        </div>
        <div style="border:1px solid #e2e8f0;border-top:none;padding:22px;border-radius:0 0 8px 8px;background:#fff;">
          <p style="margin:0 0 10px;">${greeting}</p>
          <p style="margin:0 0 14px;line-height:1.55;">${intro}</p>
          <table style="width:100%;font-size:14px;border-collapse:collapse;margin:10px 0 16px;">
            <tr><td style="padding:4px 0;color:#64748b;">Order #</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(orderNumber)}</td></tr>
            <tr><td style="padding:4px 0;color:#64748b;">${label} #</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(invNum)}</td></tr>
            <tr><td style="padding:4px 0;color:#64748b;">Amount</td><td style="padding:4px 0;font-weight:600;">${fmtINR(total)}</td></tr>
          </table>
          <p style="margin:14px 0 6px;">For any clarifications, simply reply to this email.</p>
          <p style="margin:18px 0 0;">Warm regards,<br/><b>Xboom Utilities</b></p>
        </div>
        <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:14px;">
          This is an automated message from Xboom Utilities.
        </p>
      </div>
    `;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM,
        to: [customerEmail],
        subject,
        html,
        attachments: [
          {
            filename: `${invNum}.pdf`,
            content: b64,
          },
        ],
      }),
    });
    const result = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const errMsg = (result && (result.message || result.error)) || `HTTP ${resp.status}`;
      await admin.from("invoice_email_log").insert({
        ...logBase, to_email: customerEmail, status: "failed", error: String(errMsg).slice(0, 500),
      });
      return new Response(JSON.stringify({ error: errMsg }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin.from("invoice_email_log").insert({
      ...logBase, to_email: customerEmail, status: "sent",
    });

    return new Response(JSON.stringify({ ok: true, id: result?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-invoice-email error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});