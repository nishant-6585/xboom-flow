// Daily digest of portal documents uploaded in the last 24h.
// One email per account, listing new docs with links. Auth: X-Cron-Secret.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail as sendMailSeam } from "../_shared/email.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function ok(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

async function sendDigest(opts: {
  accountId: string;
  recipient: string;
  items: Array<{ title: string | null; doc_type: string; order_number: string | null }>;
}) {
  // Stable idempotency: one digest per (account, recipient, day). Retries
  // of the same run collapse; the next day produces a fresh key.
  const day = new Date().toISOString().slice(0, 10);
  const idempotencyKey = `portal-docs-digest:${opts.accountId}:${day}`;
  const r = await sendMailSeam({
    // Periodic informational — NOT transactional; suppression + unsubscribe apply.
    provider: "platform",
    to: opts.recipient,
    subject: "",
    html: "",
    templateName: "portal-docs-digest",
    templateData: {
      items: opts.items.map((d) => ({
        title: d.title ?? d.doc_type,
        doc_type: d.doc_type,
        order_number: d.order_number ?? undefined,
      })),
      documents_url: "https://xboomflow.com/portal/documents",
    },
    idempotencyKey,
  });
  return r.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return ok({ error: "unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  // Fetch new documents joined with order → account
  const { data: docs } = await admin
    .from("portal_documents")
    .select("id, doc_type, title, file_url, external_url, uploaded_at, order_id, order:portal_orders(order_number, account_id)")
    .gte("uploaded_at", since)
    .order("uploaded_at", { ascending: false })
    .limit(1000);

  type Doc = {
    id: string; doc_type: string; title: string | null; file_url: string | null; external_url: string | null; uploaded_at: string;
    order: { order_number: string; account_id: string } | null;
  };

  // Group by account_id
  const groups = new Map<string, Doc[]>();
  for (const d of ((docs ?? []) as unknown as Doc[])) {
    const aid = d.order?.account_id;
    if (!aid) continue;
    if (!groups.has(aid)) groups.set(aid, []);
    groups.get(aid)!.push(d);
  }

  const sent: string[] = [];

  for (const [accountId, list] of groups) {
    const { data: contacts } = await admin
      .from("portal_contacts")
      .select("id, email, whatsapp_number")
      .eq("account_id", accountId).eq("is_active", true);
    const cl = (contacts ?? []) as Array<{ id: string; email: string | null; whatsapp_number: string | null }>;
    if (cl.length === 0) continue;
    const ids = cl.map((c) => c.id);
    const { data: prefs } = await admin
      .from("portal_notification_preferences")
      .select("contact_id, email_new_docs")
      .in("contact_id", ids);
    const prefMap = new Map<string, boolean>();
    for (const p of (prefs ?? []) as Array<{ contact_id: string; email_new_docs: boolean | null }>) {
      prefMap.set(p.contact_id, p.email_new_docs !== false);
    }

    for (const c of cl) {
      if (!c.email) continue;
      if (prefMap.get(c.id) === false) continue; // explicit opt-out
      const ok2 = await sendDigest({
        accountId,
        recipient: c.email,
        items: list.map((d) => ({
          title: d.title,
          doc_type: d.doc_type,
          order_number: d.order?.order_number ?? null,
        })),
      });
      if (ok2) sent.push(c.email);
    }
  }

  return ok({ ok: true, accounts: groups.size, emails_sent: sent.length });
});