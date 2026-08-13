import { createClient } from "npm:@supabase/supabase-js@2";
import {
  FB_FORM_TYPE,
  FB_GRAPH,
  extractFields,
  fbToken,
  fetchFormName,
  normalizePhone,
} from "../_shared/facebook-leads.ts";

const VERIFY_TOKEN = Deno.env.get("FB_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("FB_APP_SECRET") ?? "";

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const admin = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const body = await req.text();
  const sigHeader = req.headers.get("x-hub-signature-256") ?? "";
  const expected = "sha256=" + (await hmacHex(APP_SECRET, body));
  if (sigHeader !== expected) {
    console.error("Signature mismatch");
    return new Response("Invalid signature", { status: 401 });
  }

  let data: any;
  try {
    data = JSON.parse(body);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (data.object !== "page") return new Response("ok", { status: 200 });

  const supabase = admin();

  for (const entry of data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;
      const value = change.value ?? {};
      const { leadgen_id, form_id, page_id } = value;

      // Case A: field_data inline. Case B: fetch by leadgen_id.
      let lead: any = null;
      if (Array.isArray(value.field_data) && value.field_data.length > 0) {
        lead = value;
      } else if (leadgen_id) {
        try {
          const res = await fetch(
            `${FB_GRAPH}/${leadgen_id}?fields=field_data,created_time&access_token=${fbToken()}`,
          );
          if (!res.ok) {
            console.error("Graph API error", leadgen_id, await res.text());
            continue;
          }
          lead = await res.json();
        } catch (e) {
          console.error("Graph fetch failed", leadgen_id, (e as Error).message);
          continue;
        }
      } else {
        console.error("No field_data and no leadgen_id — skipping");
        continue;
      }

      const { name, email, phone, fields } = extractFields(lead.field_data);
      const formName = await fetchFormName(form_id ?? lead.form_id ?? "");

      // Duplicate guard: same phone, same form_type, within 60 seconds.
      const digits = normalizePhone(phone);
      if (digits) {
        const since = new Date(Date.now() - 60_000).toISOString();
        const { data: dupes } = await supabase
          .from("leads")
          .select("id")
          .eq("form_type", FB_FORM_TYPE)
          .ilike("phone", `%${digits}%`)
          .gte("submitted_at", since)
          .limit(1);
        if (dupes && dupes.length > 0) {
          console.log("Duplicate FB lead skipped", leadgen_id);
          continue;
        }
      }

      const { error } = await supabase.from("leads").insert({
        form_type: FB_FORM_TYPE,
        name,
        email,
        phone,
        subject: "Facebook Lead Form",
        message: formName,
        status: "new",
        source: "Facebook Leads",
        submitted_at: new Date().toISOString(),
        page_url: page_id ? `https://www.facebook.com/${page_id}` : null,
        user_agent: "XBOOM-FBLeads-Webhook/2.0",
        payload: { raw: data, lead, fields, leadgen_id: leadgen_id ?? null, form_id: form_id ?? null },
      });

      if (error) console.error("Insert failed", leadgen_id, error.message);
      else console.log("FB lead inserted", leadgen_id, name);
    }
  }

  return new Response("ok", { status: 200 });
});
