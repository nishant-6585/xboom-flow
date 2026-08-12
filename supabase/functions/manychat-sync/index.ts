// Refreshes ManyChat contacts already known to XBOOM using the ManyChat API.
// ManyChat's public API has no "list all subscribers" endpoint, so realtime
// capture happens in `manychat-webhook`; this function re-pulls the latest
// profile/tags/custom fields for stored contacts (manual button + hourly cron).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-manychat-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

async function fetchWithTimeout(url: string, init: RequestInit, ms = 15000) {
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

  const apiKey = Deno.env.get("MANYCHAT_API_KEY");
  if (!apiKey) return json({ ok: false, error: "MANYCHAT_API_KEY not configured" }, 500);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Auth: an approved admin JWT, the service role key (cron), or the shared secret.
  const cronSecret = Deno.env.get("MANYCHAT_WEBHOOK_SECRET");
  const providedSecret = req.headers.get("x-manychat-secret") ?? "";
  const globalCronSecret = Deno.env.get("CRON_SECRET");
  const providedCron = req.headers.get("x-cron-secret") ?? "";
  let authorized =
    Boolean(cronSecret && providedSecret && providedSecret === cronSecret) ||
    Boolean(globalCronSecret && providedCron && providedCron === globalCronSecret);
  let triggerSource = authorized ? "cron" : "manual";

  if (!authorized) {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ ok: false, error: "unauthorized" }, 401);
    // Scheduled runs authenticate with the service role key.
    if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      triggerSource = "cron";
      authorized = true;
    }
  }

  if (!authorized) {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ ok: false, error: "unauthorized" }, 401);
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ ok: false, error: "forbidden" }, 403);
    authorized = true;
  }

  const { limit = 200 } = await req.json().catch(() => ({}));
  const cap = Math.min(Math.max(Number(limit) || 200, 1), 500);

  const { data: rows, error: rowsErr } = await admin
    .from("manychat_leads")
    .select("id, manychat_contact_id")
    .not("manychat_contact_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(cap);

  if (rowsErr) return json({ ok: false, error: rowsErr.message }, 500);

  let updated = 0, skipped = 0;
  const errors: string[] = [];

  for (const row of rows ?? []) {
    const url = `https://api.manychat.com/fb/subscriber/getInfo?subscriber_id=${encodeURIComponent(row.manychat_contact_id!)}`;
    let res: Response;
    try {
      res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    } catch (e) {
      errors.push(`${row.manychat_contact_id}: ${(e as Error).message}`);
      continue;
    }
    if (!res.ok) {
      errors.push(`${row.manychat_contact_id}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      continue;
    }
    const payload = await res.json().catch(() => null);
    const c = payload?.data;
    if (!c) { skipped++; continue; }

    const custom: Record<string, unknown> = {};
    for (const f of Array.isArray(c.custom_fields) ? c.custom_fields : []) {
      if (f && typeof f === "object" && "name" in f) custom[String(f.name)] = f.value ?? null;
    }
    const tags = (Array.isArray(c.tags) ? c.tags : [])
      .map((t: any) => (typeof t === "string" ? t : t?.name))
      .filter(Boolean);

    const patch = {
      customer_name: str(c.name) ?? (str([str(c.first_name), str(c.last_name)].filter(Boolean).join(" ")) || null),
      first_name: str(c.first_name),
      last_name: str(c.last_name),
      phone_number: str(c.phone) ?? str(custom["phone"]),
      email: str(c.email) ?? str(custom["email"]),
      tags,
      custom_fields: custom,
      last_interaction_at: str(c.last_interaction),
      synced_at: new Date().toISOString(),
    };

    const { error } = await admin.from("manychat_leads").update(patch).eq("id", row.id);
    if (error) errors.push(error.message); else updated++;
  }

  await admin.from("manychat_sync_log").insert({
    trigger_source: triggerSource,
    received: rows?.length ?? 0,
    created: 0,
    updated,
    skipped,
    error: errors.length ? errors.slice(0, 5).join(" | ") : null,
  });

  return json({ ok: errors.length === 0, checked: rows?.length ?? 0, updated, skipped, errors: errors.slice(0, 5) });
});
