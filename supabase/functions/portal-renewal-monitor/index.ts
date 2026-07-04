// Daily cron — emails customers when DaaS or AMC is due to expire in ≤30 days.
// Dedupes per (order_id, alert_type, expires_on) via portal_renewal_alerts.
// Auth: X-Cron-Secret header.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail as sendMailSeam } from "../_shared/email.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function ok(body: unknown, s = 200) {
  return new Response(JSON.stringify(body), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

async function sendEmail(to: string, subject: string, html: string) {
  const r = await sendMailSeam({ to, subject, html });
  return r.ok;
}

async function sendWhatsApp(phone: string, template: string, vals: string[]) {
  const KEY = Deno.env.get("INTERAKT_API_KEY");
  if (!KEY) return false;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 10) return false;
  const cc = digits.length === 10 ? "91" : digits.slice(0, digits.length - 10);
  const pn = digits.slice(-10);
  try {
    const r = await fetch("https://api.interakt.ai/v1/public/message/", {
      method: "POST",
      headers: { Authorization: `Basic ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ countryCode: cc, phoneNumber: pn, callbackData: `renew_${Date.now()}`, type: "Template", template: { name: template, languageCode: "en", bodyValues: vals } }),
    });
    return r.ok;
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return ok({ error: "unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const today = new Date();
  const cutoff = new Date(today.getTime() + 30 * 86400 * 1000).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  type Row = { id: string; order_number: string; account_id: string; daas_expires_at: string | null; amc_expires_at: string | null };

  const { data: orders } = await admin
    .from("portal_orders")
    .select("id, order_number, account_id, daas_expires_at, amc_expires_at")
    .or(`and(daas_expires_at.gte.${todayStr},daas_expires_at.lte.${cutoff}),and(amc_expires_at.gte.${todayStr},amc_expires_at.lte.${cutoff})`)
    .limit(500);

  const sent: Array<{ order_id: string; type: string }> = [];

  for (const o of ((orders ?? []) as Row[])) {
    const checks: Array<{ type: "daas_renewal" | "amc_expiry"; expires: string; tmpl: string; label: string }> = [];
    if (o.daas_expires_at && o.daas_expires_at >= todayStr && o.daas_expires_at <= cutoff) {
      checks.push({ type: "daas_renewal", expires: o.daas_expires_at, tmpl: "portal_daas_renewal", label: "DaaS subscription" });
    }
    if (o.amc_expires_at && o.amc_expires_at >= todayStr && o.amc_expires_at <= cutoff) {
      checks.push({ type: "amc_expiry", expires: o.amc_expires_at, tmpl: "portal_amc_expiry", label: "AMC contract" });
    }

    for (const c of checks) {
      const { data: existing } = await admin
        .from("portal_renewal_alerts")
        .select("id")
        .eq("order_id", o.id).eq("alert_type", c.type).eq("expires_on", c.expires)
        .maybeSingle();
      if (existing) continue;

      const { data: contacts } = await admin
        .from("portal_contacts")
        .select("id, full_name, email, whatsapp_number")
        .eq("account_id", o.account_id).eq("is_active", true);

      const contactList = (contacts ?? []) as Array<{ id: string; full_name: string | null; email: string | null; whatsapp_number: string | null }>;
      const ids = contactList.map((x) => x.id);
      const { data: prefs } = await admin
        .from("portal_notification_preferences")
        .select("contact_id, email_renewals, whatsapp_renewals")
        .in("contact_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const prefMap = new Map<string, { email: boolean; whatsapp: boolean }>();
      for (const p of (prefs ?? []) as Array<{ contact_id: string; email_renewals: boolean | null; whatsapp_renewals: boolean | null }>) {
        prefMap.set(p.contact_id, { email: p.email_renewals !== false, whatsapp: p.whatsapp_renewals !== false });
      }

      const subject = `Action needed: ${c.label} expiring on ${c.expires}`;
      const html = `<div style="font-family:Arial,sans-serif;padding:24px"><h2 style="color:#0c2340">${c.label} expiry reminder</h2><p>Your ${c.label} on order <strong>${o.order_number}</strong> expires on <strong>${c.expires}</strong>.</p><p>Please reach out to your account manager to renew and avoid any service disruption.</p><p><a href="https://xboomflow.com/portal/orders/${o.id}" style="background:#0c2340;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">View order</a></p></div>`;

      for (const ct of contactList) {
        const p = prefMap.get(ct.id) ?? { email: true, whatsapp: true };
        if (ct.email && p.email) await sendEmail(ct.email, subject, html);
        if (ct.whatsapp_number && p.whatsapp) {
          await sendWhatsApp(ct.whatsapp_number, c.tmpl, [ct.full_name ?? "Customer", o.order_number, c.expires]);
        }
      }

      await admin.from("portal_renewal_alerts").insert({ order_id: o.id, alert_type: c.type, expires_on: c.expires });
      sent.push({ order_id: o.id, type: c.type });
    }
  }

  return ok({ ok: true, sent_count: sent.length, sent });
});