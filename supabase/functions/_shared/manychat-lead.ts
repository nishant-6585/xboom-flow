// Shared ManyChat lead normalisation + de-duplicated upsert.
// Used by `manychat-webhook` (realtime capture) and `manychat-admin`
// (test webhook + CSV backfill importer) so both paths behave identically.

export const mcStr = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

export interface ManychatLeadRow {
  manychat_contact_id: string | null;
  customer_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  country_code: string | null;
  email: string | null;
  city: string | null;
  channel: string | null;
  source: string;
  page_id: string | null;
  flow_name: string | null;
  product_name: string | null;
  quantity: number | null;
  notes: string | null;
  company: string | null;
  tags: string[];
  custom_fields: Record<string, unknown>;
  raw_payload: Record<string, unknown>;
  manychat_created_at: string | null;
  last_interaction_at: string | null;
  synced_at: string;
}

// ── Phone resolution ──────────────────────────────────────────────────────
// WhatsApp-only ManyChat contacts leave the `phone` system field empty — the
// number lives in `whatsapp_phone` / `wa_id`. When the contact record carries
// no number at all, the lead has often typed a callback number into the chat
// itself, so free text is mined as a last resort.

const IN_MOBILE = /^[6-9]\d{9}$/;

/**
 * Digits-only form of a number found in free text. Bare 10-digit Indian
 * mobiles get the `91` prefix so they match ManyChat's `whatsapp_phone`
 * format. Returns null when the value cannot be a dialable number — this is
 * deliberately strict, because chat text is full of prices, pincodes and
 * model numbers. Non-Indian numbers are only accepted at 11-15 digits, so a
 * bare 10-digit foreign number typed without a country code is not mined.
 */
export function normalisePhoneDigits(value: unknown): string | null {
  const s = mcStr(value);
  if (!s) return null;
  let d = s.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) return IN_MOBILE.test(d) ? `91${d}` : null;
  if (d.length === 12 && d.startsWith("91")) return IN_MOBILE.test(d.slice(2)) ? d : null;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

// Needs >= 10 characters, so grouped amounts ("1,77,000") cannot match.
const PHONE_IN_TEXT = /(?:\+|00)?\d[\d\s().-]{8,18}\d/g;
const CURRENCY_BEFORE = /(?:₹|rs\.?|inr|usd|\$)\s*$/i;

/** Pulls a plausible callback number out of a chat message, or null. */
export function extractPhoneFromText(text: unknown): string | null {
  const s = mcStr(text);
  if (!s) return null;
  for (const m of s.matchAll(PHONE_IN_TEXT)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (CURRENCY_BEFORE.test(s.slice(Math.max(0, start - 6), start))) continue; // "₹ 1 77 000"
    if (/^\s*\/-/.test(s.slice(end, end + 3))) continue;                        // "177000/-"
    const phone = normalisePhoneDigits(m[0]);
    if (phone) return phone;
  }
  return null;
}

/**
 * A number ManyChat supplied, reduced to digits. The API returns
 * `whatsapp_phone` as "+919952240006" while a CSV export gives
 * "919952240006"; storing digits keeps both routes writing the same string,
 * which matters because de-duplication matches phone_number exactly. Values
 * carrying fewer than 8 digits are junk (a custom field holding "hi") and are
 * treated as absent so the next candidate is tried.
 */
const providerPhone = (value: unknown): string | null => {
  const s = mcStr(value);
  if (!s) return null;
  const d = s.replace(/\D/g, "");
  return d.length >= 8 ? d : null;
};

/**
 * The number ManyChat itself holds, from every field it can live in.
 */
export function manychatPhoneField(
  c: Record<string, any>,
  raw: Record<string, any>,
  custom: Record<string, unknown>,
): string | null {
  return (
    providerPhone(c.phone) ??
    providerPhone(raw.phone) ??
    providerPhone(raw.phone_number) ??
    providerPhone(c.whatsapp_phone) ??
    providerPhone(raw.whatsapp_phone) ??
    providerPhone(c.wa_id) ??
    providerPhone(raw.wa_id) ??
    providerPhone(c.whatsapp_id) ??
    providerPhone(custom["phone"]) ??
    providerPhone(custom["phone_number"]) ??
    providerPhone(custom["mobile"]) ??
    providerPhone(custom["whatsapp"])
  );
}

/** What ManyChat holds, else a number the lead typed into the chat. */
export function resolveManychatPhone(
  c: Record<string, any>,
  raw: Record<string, any>,
  custom: Record<string, unknown>,
): string | null {
  return (
    manychatPhoneField(c, raw, custom) ??
    extractPhoneFromText(c.last_input_text) ??
    extractPhoneFromText(raw.message) ??
    extractPhoneFromText(raw.notes)
  );
}

/**
 * Normalises any ManyChat-shaped payload: a flat body mapped in the flow
 * builder, or the full subscriber object under `subscriber`/`contact`/`data`.
 */
export function normaliseManychatContact(raw: Record<string, any>): ManychatLeadRow {
  const c = raw.subscriber ?? raw.contact ?? raw.data ?? raw;

  const custom: Record<string, unknown> = {};
  const cfArray = Array.isArray(c.custom_fields) ? c.custom_fields : [];
  for (const f of cfArray) {
    if (f && typeof f === "object" && "name" in f) custom[String(f.name)] = f.value ?? null;
  }
  if (raw.custom_fields && !Array.isArray(raw.custom_fields) && typeof raw.custom_fields === "object") {
    Object.assign(custom, raw.custom_fields);
  }

  const first = mcStr(c.first_name) ?? mcStr(raw.first_name);
  const last = mcStr(c.last_name) ?? mcStr(raw.last_name);
  const name =
    mcStr(c.name) ??
    mcStr(raw.name) ??
    mcStr(raw.customer_name) ??
    (mcStr([first, last].filter(Boolean).join(" ")) || null);

  const tags = Array.isArray(c.tags)
    ? c.tags.map((t: any) => (typeof t === "string" ? t : t?.name)).filter(Boolean)
    : Array.isArray(raw.tags)
      ? raw.tags.filter(Boolean)
      : [];

  const qtyRaw = raw.quantity ?? custom["quantity"];

  // Channel is inferred from channel-specific identifiers when not sent explicitly.
  const whatsappPhone = mcStr(c.whatsapp_phone) ?? mcStr(raw.whatsapp_phone);
  const igHandle = mcStr(c.ig_username) ?? mcStr(c.ig_id) ?? mcStr(raw.ig_username);
  const inferredChannel = whatsappPhone ? "whatsapp" : igHandle ? "instagram" : null;

  return {
    manychat_contact_id:
      mcStr(c.id) ?? mcStr(c.subscriber_id) ?? mcStr(raw.subscriber_id) ?? mcStr(raw.contact_id) ??
      mcStr(raw.manychat_contact_id),
    customer_name: name,
    first_name: first,
    last_name: last,
    phone_number: resolveManychatPhone(c, raw, custom),
    country_code: mcStr(raw.country_code) ?? null,
    email: mcStr(c.email) ?? mcStr(raw.email) ?? mcStr(custom["email"]),
    city: mcStr(raw.city) ?? mcStr(custom["city"]) ?? null,
    channel: mcStr(raw.channel) ?? mcStr(c.channel) ?? inferredChannel,
    source: mcStr(raw.source) ?? "ManyChat",
    page_id: mcStr(raw.page_id) ?? mcStr(c.page_id),
    flow_name: mcStr(raw.flow_name) ?? mcStr(raw.flow) ?? null,
    product_name: mcStr(raw.product_name) ?? mcStr(custom["product"]) ?? mcStr(custom["product_name"]),
    quantity: Number.isFinite(Number(qtyRaw)) && mcStr(qtyRaw) ? Number(qtyRaw) : null,
    notes: mcStr(raw.notes) ?? mcStr(raw.message) ?? mcStr(custom["message"]) ?? mcStr(c.last_input_text),
    company: mcStr(raw.company) ?? mcStr(custom["company"]),
    tags,
    custom_fields: custom,
    raw_payload: raw,
    manychat_created_at: mcStr(c.subscribed) ?? mcStr(raw.manychat_created_at) ?? mcStr(raw.created_at) ?? null,
    last_interaction_at: mcStr(c.last_interaction) ?? null,
    synced_at: new Date().toISOString(),
  };
}

export type UpsertOutcome =
  | { result: "created"; leadId: string | null }
  | { result: "updated"; leadId: string }
  | { result: "skipped"; reason: string }
  | { result: "error"; error: string };

/** Latest incoming message text from a ManyChat payload, if any. */
export function extractLatestMessage(raw: Record<string, any>): string | null {
  const c = raw.subscriber ?? raw.contact ?? raw.data ?? raw;
  return mcStr(c.last_input_text) ?? mcStr(raw.last_input_text) ?? mcStr(raw.message) ?? null;
}

/**
 * Appends an incoming message to the lead's timeline. Skips exact repeats
 * of the most recent logged message within 5 minutes (the default-reply flow
 * can re-fire for a single message).
 */
export async function logManychatMessage(
  admin: { from: (t: string) => any },
  leadId: string,
  row: ManychatLeadRow,
  message: string,
): Promise<void> {
  const { data: last } = await admin
    .from("manychat_messages")
    .select("message, received_at")
    .eq("lead_id", leadId)
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (
    last &&
    last.message === message &&
    Date.now() - new Date(last.received_at).getTime() < 5 * 60 * 1000
  ) {
    return;
  }
  await admin.from("manychat_messages").insert({
    lead_id: leadId,
    manychat_contact_id: row.manychat_contact_id,
    channel: row.channel,
    message,
  });
}

/**
 * De-duplicated insert/update. Matches on manychat_contact_id first, then
 * phone_number. Rows with neither identifier are skipped. Round-robin
 * assignment is handled by the BEFORE INSERT trigger on manychat_leads.
 */
export async function upsertManychatLead(
  admin: { from: (t: string) => any },
  row: ManychatLeadRow,
  opts: { requireIdentifier?: "contact_or_phone" | "any" } = {},
): Promise<UpsertOutcome> {
  const mode = opts.requireIdentifier ?? "any";
  const hasIdentifier =
    mode === "contact_or_phone"
      ? Boolean(row.manychat_contact_id || row.phone_number)
      : Boolean(row.manychat_contact_id || row.phone_number || row.email);
  if (!hasIdentifier) return { result: "skipped", reason: "no manychat_contact_id or phone_number" };

  let existingId: string | null = null;
  if (row.manychat_contact_id) {
    const { data } = await admin
      .from("manychat_leads").select("id")
      .eq("manychat_contact_id", row.manychat_contact_id).maybeSingle();
    existingId = data?.id ?? null;
  }
  if (!existingId && row.phone_number) {
    const { data } = await admin
      .from("manychat_leads").select("id")
      .eq("phone_number", row.phone_number).limit(1).maybeSingle();
    existingId = data?.id ?? null;
  }

  if (existingId) {
    // A ManyChat flow can re-fire with only the fields of that step mapped
    // (often just `message`). Dropping the nulls keeps a partial payload from
    // clearing a phone number or email an earlier payload already captured.
    const patch = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null));
    const { error } = await admin.from("manychat_leads").update(patch).eq("id", existingId);
    return error ? { result: "error", error: error.message } : { result: "updated", leadId: existingId };
  }
  const { data: inserted, error } = await admin
    .from("manychat_leads").insert(row).select("id").maybeSingle();
  return error
    ? { result: "error", error: error.message }
    : { result: "created", leadId: inserted?.id ?? null };
}
