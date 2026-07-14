import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const VERIFY_TOKEN = Deno.env.get("FB_VERIFY_TOKEN")!;
const PAGE_ACCESS_TOKEN = Deno.env.get("FB_PAGE_ACCESS_TOKEN")!;
const APP_SECRET = Deno.env.get("FB_APP_SECRET")!;
const LEADS_INCOMING_URL = "https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/leads-incoming";
const LEADS_WEBHOOK_SECRET = Deno.env.get("LEADS_WEBHOOK_SECRET")!;

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
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

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const body = await req.text();
  const sigHeader = req.headers.get("x-hub-signature-256") ?? "";
  const expected = "sha256=" + (await hmacHex(APP_SECRET, body));
  if (sigHeader !== expected) {
    console.error("Signature mismatch", { sigHeader, expected });
    return new Response("Invalid signature", { status: 401 });
  }

  const data = JSON.parse(body);
  if (data.object !== "page") {
    return new Response("ok", { status: 200 });
  }

  for (const entry of data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;

      const { leadgen_id, ad_id, campaign_id, adgroup_id, form_id, page_id } = change.value;
      console.log("New FB lead:", leadgen_id);

      const graphRes = await fetch(
        `https://graph.facebook.com/v19.0/${leadgen_id}?fields=id,created_time,field_data,ad_id,campaign_id,form_id&access_token=${PAGE_ACCESS_TOKEN}`
      );

      if (!graphRes.ok) {
        console.error("Graph API error for lead", leadgen_id, await graphRes.text());
        continue;
      }

      const lead = await graphRes.json();

      const fields: Record<string, string> = {};
      for (const f of lead.field_data ?? []) {
        fields[f.name] = f.values?.[0] ?? "";
      }

      const name =
        fields["full_name"] || fields["name"] ||
        [fields["first_name"], fields["last_name"]].filter(Boolean).join(" ") || "";
      const email =
        fields["email"] || fields["work_email"] || fields["email_address"] || "";
      const phone =
        fields["phone_number"] || fields["phone"] || fields["mobile"] || "";

      const row = {
        form_type: "fb-lead-ads",
        page_url: `https://www.facebook.com/${page_id ?? ""}`,
        ip: "",
        user_agent: "XBOOM-FBLeads-Webhook/1.0",
        submitted_at: lead.created_time
          ? new Date(lead.created_time).toISOString()
          : new Date().toISOString(),
        name,
        email,
        phone,
        source: "Facebook Leads",
        gclid: "",
        payload: {
          leadgen_id: leadgen_id ?? "",
          ad_id: ad_id ?? lead.ad_id ?? "",
          campaign_id: campaign_id ?? lead.campaign_id ?? "",
          adgroup_id: adgroup_id ?? "",
          form_id: form_id ?? lead.form_id ?? "",
          page_id: page_id ?? "",
          raw_fields: fields,
        },
      };

      const rowJson = JSON.stringify(row);
      const sig = "sha256=" + (await hmacHex(LEADS_WEBHOOK_SECRET, rowJson));

      const pushRes = await fetch(LEADS_INCOMING_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-XBM-Signature": sig,
        },
        body: rowJson,
      });

      if (!pushRes.ok) {
        console.error("Failed to push lead", leadgen_id, await pushRes.text());
      } else {
        console.log("Lead pushed to CRM", leadgen_id, name);
      }
    }
  }

  return new Response("ok", { status: 200 });
});