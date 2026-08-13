// Shared helpers for Facebook (Meta) lead ingestion.
export const FB_FORM_TYPE = "Facebook Leads";
export const FB_PAGE_ID = "1585587728331561";
export const FB_GRAPH = "https://graph.facebook.com/v19.0";

export function fbToken(): string {
  return (
    Deno.env.get("FACEBOOK_PAGE_ACCESS_TOKEN") ??
    Deno.env.get("FB_PAGE_ACCESS_TOKEN") ??
    ""
  );
}

export interface FbFieldDatum { name: string; values?: string[] }

export function extractFields(fieldData: FbFieldDatum[] | undefined | null) {
  const f: Record<string, string> = {};
  for (const d of fieldData ?? []) f[d.name] = (d.values?.[0] ?? "").trim();
  const name =
    f["full_name"] || f["name"] ||
    [f["first_name"], f["last_name"]].filter(Boolean).join(" ") || "";
  const email = f["email"] || f["work_email"] || f["email_address"] || "";
  const phone = f["phone_number"] || f["phone"] || f["mobile"] || "";
  return { name, email, phone, fields: f };
}

export function normalizePhone(phone: string): string {
  return (phone || "").replace(/\D/g, "").slice(-10);
}

/** Fetch a form's name (best effort). */
export async function fetchFormName(formId: string): Promise<string> {
  if (!formId) return "Facebook Lead Form";
  try {
    const res = await fetch(`${FB_GRAPH}/${formId}?fields=name&access_token=${fbToken()}`);
    if (!res.ok) return "Facebook Lead Form";
    const json = await res.json();
    return json?.name || "Facebook Lead Form";
  } catch {
    return "Facebook Lead Form";
  }
}
