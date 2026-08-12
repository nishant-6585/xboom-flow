// Public webhook receiver for ManyChat "External Request" actions.
// Verifies a shared secret header, normalises the contact payload and
// upserts it into public.manychat_leads (round-robin assignment happens
// in a DB trigger).
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

function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

function normalise(raw: Record<string, any>) {
  // ManyChat can send either a flat body (mapped in the flow builder) or
  // the full subscriber object under `subscriber` / `contact` / `data`.
  const c = raw.subscriber ?? raw.contact ?? raw.data ?? raw;
  const custom: Record<string, unknown> = {};
  const cfArray = Array.isArray(c.custom_fields) ? c.custom_fields : [];
  for (const f of cfArray) {
    if (f && typeof f === "object" && "name" in f) custom[String(f.name)] = f.value ?? null;
  }
  if (raw.custom_fields && !Array.isArray(raw.custom_fields) && typeof raw.custom_fields === "object") {
    Object.assign(custom, raw.custom_fields);
  }

  const first = str(c.first_name) ?? str(raw.first_name);
  const last = str(c.last_name) ?? str(raw.last_name);
  const name = str(c.name) ?? str(raw.name) ?? (str([first, last].filter(Boolean).join(" ")) || null);

  const tags = Array.isArray(c.tags)
    ? c.tags.map((t: any) => (typeof t === "string" ? t : t?.name)).filter(Boolean)
    : Array.isArray(raw.tags)
      ? raw.tags.filter(Boolean)
      : [];

  return {
    manychat_contact_id: str(c.id) ?? str(c.subscriber_id) ?? str(raw.subscriber_id) ?? str(raw.contact_id),
    customer_name: name,
    first_name: first,
    last_name: last,
    phone_number: str(c.phone) ?? str(raw.phone) ?? str(raw.phone_number) ?? str(custom["phone"]),
    country_code: str(raw.country_code) ?? null,
    email: str(c.email) ?? str(raw.email) ?? str(custom["email"]),
    city: str(raw.city) ?? str(custom["city"]) ?? null,
    channel: str(raw.channel) ?? str(c.channel) ?? null,
    page_id: str(raw.page_id) ?? str(c.page_id),
    flow_name: str(raw.flow_name) ?? str(raw.flow) ?? null,
    product_name: str(raw.product_name) ?? str(custom["product"]) ?? str(custom["product_name"]),
    quantity: Number.isFinite(Number(raw.quantity ?? custom["quantity"]))
      ? Number(raw.quantity ?? custom["quantity"])
      : null,
    notes: str(raw.notes) ?? str(raw.message) ?? str(custom["message"]),
    company: str(raw.company) ?? str(custom["company"]),
    tags,
    custom_fields: custom,
    raw_payload: raw,
    manychat_created_at: str(c.subscribed) ?? str(raw.created_at) ?? null,
    last_interaction_at: str(c.last_interaction) ?? null,
    synced_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const secret = Deno.env.get("MANYCHAT_WEBHOOK_SECRET");
  if (!secret) {
    console.error("[manychat-webhook] MANYCHAT_WEBHOOK_SECRET not configured");
    return json({ ok: false, error: "server misconfigured" }, 500);
  }
  const provided = req.headers.get("x-manychat-secret") ?? "";
  if (!provided || !timingSafeEqual(provided, secret)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let body: any;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }
  if (!body || typeof body !== "object") {
    return json({ ok: false, error: "body must be an object" }, 400);
  }

  const items: Record<string, any>[] = Array.isArray(body)
    ? body
    : Array.isArray(body.contacts)
      ? body.contacts
      : [body];

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let created = 0, updated = 0, skipped = 0;
  const errors: string[] = [];

  for (const item of items) {
    const row = normalise(item);
    if (!row.phone_number && !row.email && !row.manychat_contact_id) {
      skipped++;
      continue;
    }

    let existingId: string | null = null;
    if (row.manychat_contact_id) {
      const { data } = await supabase
        .from("manychat_leads").select("id")
        .eq("manychat_contact_id", row.manychat_contact_id).maybeSingle();
      existingId = data?.id ?? null;
    }
    if (!existingId && row.phone_number) {
      const { data } = await supabase
        .from("manychat_leads").select("id")
        .eq("phone_number", row.phone_number).limit(1).maybeSingle();
      existingId = data?.id ?? null;
    }

    if (existingId) {
      const { error } = await supabase.from("manychat_leads").update(row).eq("id", existingId);
      if (error) errors.push(error.message); else updated++;
    } else {
      const { error } = await supabase.from("manychat_leads").insert(row);
      if (error) errors.push(error.message); else created++;
    }
  }

  await supabase.from("manychat_sync_log").insert({
    trigger_source: "webhook",
    received: items.length,
    created,
    updated,
    skipped,
    error: errors.length ? errors.slice(0, 5).join(" | ") : null,
  });

  return json({ ok: errors.length === 0, received: items.length, created, updated, skipped, errors });
});
