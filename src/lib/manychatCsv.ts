// ManyChat CSV export → manychat_leads field mapping (client-side preview).
// The mapped rows are sent to the `manychat-admin` edge function, which reuses
// the same normalisation/de-duplication helper as `manychat-webhook`.

export interface ManychatCsvRow {
  manychat_contact_id: string | null;
  customer_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  country_code: string | null;
  email: string | null;
  city: string | null;
  tags: string[];
  custom_fields: Record<string, string>;
  manychat_created_at: string | null;
}

export type FieldKey =
  | keyof Omit<ManychatCsvRow, "tags" | "custom_fields">
  | "tags"
  | "whatsapp_phone";

const ALIASES: Record<FieldKey, string[]> = {
  manychat_contact_id: ["manychat_contact_id", "subscriber id", "subscriber_id", "contact id", "contact_id", "id", "user id"],
  customer_name: ["customer_name", "name", "full name", "full_name"],
  first_name: ["first_name", "first name", "firstname"],
  last_name: ["last_name", "last name", "lastname"],
  // A raw ManyChat export carries BOTH a "Phone" column (empty for
  // WhatsApp-only contacts) and a "WhatsApp Phone" column that holds the real
  // number. They must be separate keys: detectMapping takes the first alias
  // that matches, so folding them together silently mapped every WhatsApp
  // contact to the empty Phone column.
  phone_number: ["phone_number", "phone", "phone number", "mobile"],
  whatsapp_phone: ["whatsapp_phone", "whatsapp phone", "wa phone", "whatsapp number", "wa_id", "whatsapp id"],
  country_code: ["country_code", "country code", "country"],
  email: ["email", "email address", "e-mail"],
  city: ["city", "town"],
  tags: ["tags", "tag"],
  manychat_created_at: ["manychat_created_at", "subscribed", "subscribed at", "created at", "created_at", "signed up"],
};

const norm = (s: string) => s.trim().toLowerCase().replace(/^"|"$/g, "").replace(/[\s_-]+/g, " ");

/** Minimal RFC4180-ish CSV parser (handles quoted fields, embedded commas/newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim().length));
}

export function detectMapping(headers: string[]): Partial<Record<FieldKey, number>> {
  const map: Partial<Record<FieldKey, number>> = {};
  const normalised = headers.map(norm);
  for (const key of Object.keys(ALIASES) as FieldKey[]) {
    for (const alias of ALIASES[key]) {
      const idx = normalised.indexOf(norm(alias));
      if (idx >= 0) { map[key] = idx; break; }
    }
  }
  return map;
}

const val = (cells: string[], idx?: number): string | null => {
  if (idx === undefined) return null;
  const v = (cells[idx] ?? "").trim();
  return v.length ? v : null;
};

export function mapCsvRows(headers: string[], dataRows: string[][]) {
  const mapping = detectMapping(headers);
  const mappedIdx = new Set(Object.values(mapping) as number[]);

  const rows: ManychatCsvRow[] = dataRows.map((cells) => {
    const custom_fields: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (mappedIdx.has(i)) return;
      const v = (cells[i] ?? "").trim();
      if (v.length && h.trim().length) custom_fields[h.trim()] = v;
    });

    const first = val(cells, mapping.first_name);
    const last = val(cells, mapping.last_name);
    const tagsRaw = val(cells, mapping.tags);

    return {
      manychat_contact_id: val(cells, mapping.manychat_contact_id),
      customer_name: val(cells, mapping.customer_name) ?? ([first, last].filter(Boolean).join(" ") || null),
      first_name: first,
      last_name: last,
      phone_number: val(cells, mapping.phone_number) ?? val(cells, mapping.whatsapp_phone),
      country_code: val(cells, mapping.country_code),
      email: val(cells, mapping.email),
      city: val(cells, mapping.city),
      tags: tagsRaw ? tagsRaw.split(/[;,|]/).map((t) => t.trim()).filter(Boolean) : [],
      custom_fields,
      manychat_created_at: val(cells, mapping.manychat_created_at),
    };
  });

  const usable = rows.filter((r) => r.manychat_contact_id || r.phone_number);
  return { mapping, rows, usable, unusable: rows.length - usable.length };
}

export const FIELD_LABELS: Record<FieldKey, string> = {
  manychat_contact_id: "manychat_contact_id",
  customer_name: "customer_name",
  first_name: "first_name",
  last_name: "last_name",
  phone_number: "phone_number",
  whatsapp_phone: "whatsapp_phone (fallback)",
  country_code: "country_code",
  email: "email",
  city: "city",
  tags: "tags",
  manychat_created_at: "manychat_created_at",
};
