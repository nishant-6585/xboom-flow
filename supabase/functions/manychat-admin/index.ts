// Admin-only ManyChat utilities:
//   action = "test_webhook"      -> POSTs a sample payload to manychat-webhook
//                                   using the stored MANYCHAT_WEBHOOK_SECRET
//   action = "remove_test_leads" -> deletes leads created by the test button
//   action = "csv_import"        -> backfills historical subscribers from a
//                                   ManyChat CSV export (rows mapped client-side)
// Normalisation + de-duplication is shared with manychat-webhook.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { normaliseManychatContact, upsertManychatLead } from "../_shared/manychat-lead.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export const TEST_SOURCE = "ManyChat (test)";

async function fetchWithTimeout(url: string, init: RequestInit, ms = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Auth: approved admin JWT only.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ ok: false, error: "unauthorized" }, 401);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ ok: false, error: "unauthorized" }, 401);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
  if (!isAdmin) return json({ ok: false, error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");

  if (action === "test_webhook") {
    const secret = Deno.env.get("MANYCHAT_WEBHOOK_SECRET");
    if (!secret) return json({ ok: false, error: "MANYCHAT_WEBHOOK_SECRET not configured" }, 500);

    const stamp = Date.now();
    const payload = {
      source: TEST_SOURCE,
      subscriber_id: `test-${stamp}`,
      name: "XBOOM Test Lead",
      phone: `+9199999${String(stamp).slice(-5)}`,
      email: `manychat.test+${stamp}@xboom.in`,
      city: "Bengaluru",
      product_name: "DJI Mavic 3 Enterprise",
      message: "Automated test payload from Admin → Integrations → ManyChat Leads",
    };

    const url = `${supabaseUrl}/functions/v1/manychat-webhook`;
    let status = 0;
    let responseBody = "";
    try {
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-manychat-secret": secret },
        body: JSON.stringify(payload),
      });
      status = res.status;
      responseBody = (await res.text()).slice(0, 2000);
    } catch (e) {
      return json({ ok: false, action, status: 0, response: `request failed: ${(e as Error).message}`, payload });
    }

    return json({ ok: status >= 200 && status < 300, action, status, response: responseBody, payload });
  }

  if (action === "remove_test_leads") {
    const { data, error } = await admin
      .from("manychat_leads")
      .delete()
      .eq("source", TEST_SOURCE)
      .select("id");
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, action, deleted: data?.length ?? 0 });
  }

  if (action === "csv_import") {
    const rows: Record<string, unknown>[] = Array.isArray(body?.rows) ? body.rows : [];
    if (!rows.length) return json({ ok: false, error: "no rows supplied" }, 400);
    if (rows.length > 5000) return json({ ok: false, error: "too many rows (max 5000 per import)" }, 400);

    let created = 0, updated = 0, skipped = 0;
    const errors: string[] = [];

    for (const raw of rows) {
      const row = normaliseManychatContact(raw as Record<string, any>);
      const outcome = await upsertManychatLead(admin, row, { requireIdentifier: "contact_or_phone" });
      if (outcome.result === "created") created++;
      else if (outcome.result === "updated") updated++;
      else if (outcome.result === "skipped") skipped++;
      else errors.push(outcome.error);
    }

    await admin.from("manychat_sync_log").insert({
      trigger_source: "CSV Import",
      received: rows.length,
      created,
      updated,
      skipped,
      error: errors.length ? errors.slice(0, 5).join(" | ") : null,
      details: { imported_by: userData.user.email ?? userData.user.id, errored: errors.length },
    });

    return json({
      ok: errors.length === 0,
      action,
      received: rows.length,
      created,
      updated,
      skipped,
      errored: errors.length,
      errors: errors.slice(0, 5),
    });
  }

  return json({ ok: false, error: "unknown action" }, 400);
});
