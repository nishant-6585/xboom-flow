// Inbound WhatsApp webhook from Interakt → auto-create a portal ticket.
// Public endpoint (verify_jwt = false). Optional shared-secret check via
// `INTERAKT_WEBHOOK_SECRET` query param `?token=...`.
//
// Logic:
//   1. Persist every inbound payload in `portal_inbound_messages`.
//   2. Match the sender phone (last-10 digits) to an active `portal_contact`.
//   3. If a thread already exists in last 24h → append a customer message;
//      else create a new "WhatsApp" ticket.
//   4. Skip auto-ticketing for unknown senders (still logged for ops review).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function ok(body: unknown = { ok: true }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function last10(p: string): string {
  return String(p ?? "").replace(/\D/g, "").slice(-10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return ok({ error: "method_not_allowed" });

  const expected = Deno.env.get("INTERAKT_WEBHOOK_SECRET");
  if (!expected) {
    // Fail closed — never accept unauthenticated calls if the secret is misconfigured.
    console.error("[interakt-portal-webhook] INTERAKT_WEBHOOK_SECRET is not configured");
    return ok({ error: "server_misconfigured" }, 500);
  }
  const url = new URL(req.url);
  const provided = url.searchParams.get("token") ?? req.headers.get("x-webhook-token");
  if (provided !== expected) return ok({ error: "unauthorized" }, 401);

  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return ok({ error: "invalid_json" });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Best-effort field extraction across Interakt payload shapes
  const data = (payload.data ?? payload) as Record<string, unknown>;
  const fromPhone =
    (data.customer_number as string | undefined) ??
    (data.from as string | undefined) ??
    (data.phone_number as string | undefined) ??
    (((payload as Record<string, unknown>).message as Record<string, unknown> | undefined)?.from as string | undefined) ??
    "";
  const body =
    (data.message as string | undefined) ??
    (data.body as string | undefined) ??
    (data.text as string | undefined) ??
    (((data.message as Record<string, unknown> | undefined)?.text as string | undefined)) ??
    "";

  const phoneKey = last10(fromPhone);

  // Try to match a portal contact by whatsapp_number or phone (last 10 digits)
  let matchedContactId: string | null = null;
  let accountId: string | null = null;
  let contactName: string | null = null;
  if (phoneKey.length === 10) {
    const { data: contacts } = await admin
      .from("portal_contacts")
      .select("id, account_id, full_name, phone, whatsapp_number, is_active")
      .eq("is_active", true);
    const match = ((contacts ?? []) as Array<{ id: string; account_id: string; full_name: string | null; phone: string | null; whatsapp_number: string | null }>)
      .find((c) => last10(c.whatsapp_number ?? "") === phoneKey || last10(c.phone ?? "") === phoneKey);
    if (match) {
      matchedContactId = match.id;
      accountId = match.account_id;
      contactName = match.full_name;
    }
  }

  // Log the inbound payload (always)
  const { data: inboundRow } = await admin
    .from("portal_inbound_messages")
    .insert({
      source: "interakt",
      from_phone: fromPhone || phoneKey,
      body,
      raw_payload: payload,
      matched_contact_id: matchedContactId,
    })
    .select("id")
    .single();

  if (!matchedContactId || !accountId) {
    return ok({ logged: true, ticket: null, reason: "unmatched_sender" });
  }

  // Check for an open WhatsApp ticket from this contact in the last 24h
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: openTickets } = await admin
    .from("portal_tickets")
    .select("id")
    .eq("raised_by_contact_id", matchedContactId)
    .eq("category", "whatsapp")
    .not("status", "in", "(resolved,closed)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);

  let ticketId: string;
  if (openTickets && openTickets.length > 0) {
    ticketId = (openTickets[0] as { id: string }).id;
    await admin.from("portal_ticket_messages").insert({
      ticket_id: ticketId,
      sender_id: null,
      sender_name_snapshot: contactName ?? "Customer (WhatsApp)",
      body: body || "(empty message)",
      is_internal: false,
    });
  } else {
    const subject = (body || "WhatsApp message").slice(0, 80);
    const { data: newTicket } = await admin
      .from("portal_tickets")
      .insert({
        account_id: accountId,
        raised_by_contact_id: matchedContactId,
        category: "whatsapp",
        priority: "normal",
        subject,
        description: body || "(inbound WhatsApp message)",
        status: "open",
      })
      .select("id")
      .single();
    ticketId = (newTicket as { id: string }).id;
    await admin.from("portal_ticket_messages").insert({
      ticket_id: ticketId,
      sender_id: null,
      sender_name_snapshot: contactName ?? "Customer (WhatsApp)",
      body: body || "(inbound WhatsApp message)",
      is_internal: false,
    });
  }

  if (inboundRow) {
    await admin
      .from("portal_inbound_messages")
      .update({ created_ticket_id: ticketId })
      .eq("id", (inboundRow as { id: string }).id);
  }

  return ok({ logged: true, ticket_id: ticketId });
});