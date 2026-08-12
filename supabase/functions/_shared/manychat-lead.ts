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

  return {
    manychat_contact_id:
      mcStr(c.id) ?? mcStr(c.subscriber_id) ?? mcStr(raw.subscriber_id) ?? mcStr(raw.contact_id) ??
      mcStr(raw.manychat_contact_id),
    customer_name: name,
    first_name: first,
    last_name: last,
    phone_number: mcStr(c.phone) ?? mcStr(raw.phone) ?? mcStr(raw.phone_number) ?? mcStr(custom["phone"]),
    country_code: mcStr(raw.country_code) ?? null,
    email: mcStr(c.email) ?? mcStr(raw.email) ?? mcStr(custom["email"]),
    city: mcStr(raw.city) ?? mcStr(custom["city"]) ?? null,
    channel: mcStr(raw.channel) ?? mcStr(c.channel) ?? null,
    source: mcStr(raw.source) ?? "ManyChat",
    page_id: mcStr(raw.page_id) ?? mcStr(c.page_id),
    flow_name: mcStr(raw.flow_name) ?? mcStr(raw.flow) ?? null,
    product_name: mcStr(raw.product_name) ?? mcStr(custom["product"]) ?? mcStr(custom["product_name"]),
    quantity: Number.isFinite(Number(qtyRaw)) && mcStr(qtyRaw) ? Number(qtyRaw) : null,
    notes: mcStr(raw.notes) ?? mcStr(raw.message) ?? mcStr(custom["message"]),
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
  | { result: "created" }
  | { result: "updated" }
  | { result: "skipped"; reason: string }
  | { result: "error"; error: string };

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
    const { error } = await admin.from("manychat_leads").update(row).eq("id", existingId);
    return error ? { result: "error", error: error.message } : { result: "updated" };
  }
  const { error } = await admin.from("manychat_leads").insert(row);
  return error ? { result: "error", error: error.message } : { result: "created" };
}
