// Public webhook receiver for ManyChat "External Request" actions.
// Verifies a shared secret header, normalises the contact payload and
// upserts it into public.manychat_leads (round-robin assignment happens
// in a DB trigger).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  normaliseManychatContact,
  upsertManychatLead,
  extractLatestMessage,
  logManychatMessage,
} from "../_shared/manychat-lead.ts";

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
    const row = normaliseManychatContact(item);
    const outcome = await upsertManychatLead(supabase, row);
    if (outcome.result === "created") created++;
    else if (outcome.result === "updated") updated++;
    else if (outcome.result === "skipped") skipped++;
    else errors.push(outcome.error);

    // Append the incoming message to the lead's timeline (best effort).
    if (outcome.result === "created" || outcome.result === "updated") {
      const message = extractLatestMessage(item);
      if (message && outcome.leadId) {
        try {
          await logManychatMessage(supabase, outcome.leadId, row, message);
        } catch (e) {
          console.error("[manychat-webhook] message log failed:", (e as Error).message);
        }
      }
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
