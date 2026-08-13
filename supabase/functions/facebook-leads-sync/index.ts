import { createClient } from "npm:@supabase/supabase-js@2";
import {
  FB_FORM_TYPE,
  FB_GRAPH,
  FB_PAGE_ID,
  extractFields,
  fbToken,
  normalizePhone,
} from "../_shared/facebook-leads.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Admin-only
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: "Unauthorized" }, 401);
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin");
  if (!roles || roles.length === 0) return json({ error: "Forbidden" }, 403);

  const token = fbToken();
  if (!token) return json({ error: "Facebook page access token not configured" }, 500);

  let forms_found = 0;
  let leads_fetched = 0;
  let leads_inserted = 0;
  let leads_skipped = 0;

  try {
    const formsRes = await fetch(
      `${FB_GRAPH}/${FB_PAGE_ID}/leadgen_forms?access_token=${token}&limit=100`,
    );
    if (!formsRes.ok) {
      const text = await formsRes.text();
      console.error("Graph forms error", text);
      return json({ error: "Failed to fetch lead forms", details: text }, 502);
    }
    const formsJson = await formsRes.json();
    const forms: any[] = formsJson?.data ?? [];
    forms_found = forms.length;

    // Existing FB phones, to skip duplicates
    const existing = new Set<string>();
    let from = 0;
    while (true) {
      const { data: rows } = await supabase
        .from("leads")
        .select("phone")
        .eq("form_type", FB_FORM_TYPE)
        .range(from, from + 999);
      if (!rows || rows.length === 0) break;
      for (const r of rows) {
        const d = normalizePhone(r.phone ?? "");
        if (d) existing.add(d);
      }
      if (rows.length < 1000) break;
      from += 1000;
    }

    for (const form of forms) {
      const formName = form?.name || "Facebook Lead Form";
      let next: string | null =
        `${FB_GRAPH}/${form.id}/leads?fields=field_data,created_time,id&limit=100&access_token=${token}`;

      while (next) {
        const res = await fetch(next);
        if (!res.ok) {
          console.error("Graph leads error", form.id, await res.text());
          break;
        }
        const page = await res.json();
        const leads: any[] = page?.data ?? [];
        leads_fetched += leads.length;

        const toInsert: any[] = [];
        for (const lead of leads) {
          const { name, email, phone, fields } = extractFields(lead.field_data);
          const digits = normalizePhone(phone);
          if (digits && existing.has(digits)) {
            leads_skipped += 1;
            continue;
          }
          if (digits) existing.add(digits);
          toInsert.push({
            form_type: FB_FORM_TYPE,
            name,
            email,
            phone,
            subject: "Facebook Lead Form",
            message: formName,
            status: "new",
            source: "Facebook Leads",
            submitted_at: lead.created_time
              ? new Date(lead.created_time).toISOString()
              : new Date().toISOString(),
            user_agent: "XBOOM-FBLeads-Sync/1.0",
            payload: { lead, fields, form_id: form.id, form_name: formName },
          });
        }

        if (toInsert.length > 0) {
          const { error } = await supabase.from("leads").insert(toInsert);
          if (error) {
            console.error("Bulk insert failed, falling back to row-by-row:", error.message);
            for (const row of toInsert) {
              const { error: e2 } = await supabase.from("leads").insert(row);
              if (e2) leads_skipped += 1;
              else leads_inserted += 1;
            }
          } else {
            leads_inserted += toInsert.length;
          }
        }

        next = page?.paging?.next ?? null;
      }
    }

    return json({ forms_found, leads_fetched, leads_inserted, leads_skipped });
  } catch (e) {
    console.error("facebook-leads-sync error", (e as Error).message);
    return json(
      { error: (e as Error).message, forms_found, leads_fetched, leads_inserted, leads_skipped },
      500,
    );
  }
});
