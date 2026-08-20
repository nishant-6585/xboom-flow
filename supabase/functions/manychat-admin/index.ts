// Admin-only ManyChat utilities:
//   action = "test_webhook"      -> POSTs a sample payload to manychat-webhook
//                                   using the stored MANYCHAT_WEBHOOK_SECRET
//   action = "remove_test_leads" -> deletes leads created by the test button
//   action = "csv_import"        -> backfills historical subscribers from a
//                                   ManyChat CSV export (rows mapped client-side)
//   action = "backfill_phones"   -> recovers missing numbers for stored leads
//                                   from raw_payload and the chat transcript
// Normalisation + de-duplication is shared with manychat-webhook.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  extractPhoneFromText,
  manychatPhoneField,
  normaliseManychatContact,
  upsertManychatLead,
} from "../_shared/manychat-lead.ts";

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
    // Keep each invocation well inside the 150s edge idle timeout — the client
    // splits large files into sequential batches of this size.
    if (rows.length > 500) return json({ ok: false, error: "too many rows (max 500 per request)" }, 400);

    let created = 0, updated = 0, skipped = 0;
    const errors: string[] = [];

    // Process with bounded concurrency instead of strictly sequentially.
    const CONCURRENCY = 10;
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      const slice = rows.slice(i, i + CONCURRENCY);
      const outcomes = await Promise.all(
        slice.map((raw) =>
          upsertManychatLead(admin, normaliseManychatContact(raw as Record<string, any>), {
            requireIdentifier: "contact_or_phone",
          }).catch((e) => ({ result: "error" as const, error: (e as Error).message })),
        ),
      );
      for (const outcome of outcomes) {
        if (outcome.result === "created") created++;
        else if (outcome.result === "updated") updated++;
        else if (outcome.result === "skipped") skipped++;
        else errors.push(outcome.error);
      }
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

  if (action === "backfill_phones") {
    // Leads captured before `whatsapp_phone` was read — and leads ManyChat
    // never had a number for — get one recovered from the stored payload or
    // from what the lead typed in the conversation.
    const cap = Math.min(Math.max(Number(body?.limit) || 500, 1), 2000);
    const { data: rows, error: rowsErr } = await admin
      .from("manychat_leads")
      .select("id, notes, raw_payload")
      .is("phone_number", null)
      .order("created_at", { ascending: false })
      .limit(cap);
    if (rowsErr) return json({ ok: false, error: rowsErr.message }, 500);

    let fromPayload = 0, fromChat = 0, stillMissing = 0;
    const errors: string[] = [];

    for (const row of rows ?? []) {
      // 1. The number ManyChat sent us but an older build never read.
      const raw = row.raw_payload;
      let phone: string | null = null;
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const r = raw as Record<string, any>;
        const c = r.subscriber ?? r.contact ?? r.data ?? r;
        const custom = normaliseManychatContact(r).custom_fields;
        phone = manychatPhoneField(c, r, custom);
      }
      let via: "payload" | "chat" = "payload";

      // 2. Otherwise, a number the lead typed into the conversation.
      if (!phone) {
        via = "chat";
        phone = extractPhoneFromText(row.notes);
      }
      if (!phone) {
        const { data: msgs } = await admin
          .from("manychat_messages")
          .select("message")
          .eq("lead_id", row.id)
          .order("received_at", { ascending: false })
          .limit(50);
        for (const m of msgs ?? []) {
          phone = extractPhoneFromText(m.message);
          if (phone) break;
        }
      }

      if (!phone) { stillMissing++; continue; }

      const { error } = await admin
        .from("manychat_leads")
        .update({ phone_number: phone })
        .eq("id", row.id);
      if (error) errors.push(error.message);
      else if (via === "payload") fromPayload++;
      else fromChat++;
    }

    const recovered = fromPayload + fromChat;
    await admin.from("manychat_sync_log").insert({
      trigger_source: "Phone backfill",
      received: rows?.length ?? 0,
      created: 0,
      updated: recovered,
      skipped: stillMissing,
      error: errors.length ? errors.slice(0, 5).join(" | ") : null,
      details: { run_by: userData.user.email ?? userData.user.id, from_payload: fromPayload, from_chat: fromChat },
    });

    return json({
      ok: errors.length === 0,
      action,
      scanned: rows?.length ?? 0,
      recovered,
      fromPayload,
      fromChat,
      stillMissing,
      errors: errors.slice(0, 5),
    });
  }

  return json({ ok: false, error: "unknown action" }, 400);
});
