// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Interakt template the user needs to get approved at api.interakt.ai.
// Body vars: 1=salesperson_name, 2=order_count, 3=oldest_order_number
const INTERAKT_TEMPLATE = Deno.env.get("MISSING_PHONE_TEMPLATE_NAME") ||
  "salesperson_missing_phone_reminder";

interface MissingOrderRow {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_company: string | null;
  sales_person_id: string | null;
  sales_person_name: string | null;
  created_at: string;
}

async function sendWhatsApp(
  apiKey: string,
  phone: string,
  templateName: string,
  bodyValues: string[],
) {
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 10) return { ok: false, error: "invalid phone" };
  const countryCode = digits.length === 10 ? "91" : digits.slice(0, digits.length - 10);
  const phoneNumber = digits.slice(-10);
  try {
    const res = await fetch("https://api.interakt.ai/v1/public/message/", {
      method: "POST",
      headers: {
        Authorization: `Basic ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        countryCode,
        phoneNumber,
        callbackData: `missing_phone_${Date.now()}`,
        type: "Template",
        template: {
          name: templateName,
          languageCode: "en",
          bodyValues,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `${res.status} ${JSON.stringify(data)}` };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET");
  const provided =
    req.headers.get("x-cron-secret") || req.headers.get("X-Cron-Secret");
  if (!cronSecret || provided !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const INTERAKT_API_KEY = Deno.env.get("INTERAKT_API_KEY");

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  let mode: "immediate" | "daily" = "daily";
  let immediateOrderId: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (body && typeof body === "object") {
      if (body.mode === "immediate") mode = "immediate";
      if (typeof body.order_id === "string") immediateOrderId = body.order_id;
    }
  } catch (_) { /* ignore */ }

  // Pull all currently-missing-phone orders
  let query = supabase
    .from("orders_missing_phone")
    .select(
      "id, order_number, customer_name, customer_company, sales_person_id, sales_person_name, created_at",
    )
    .order("created_at", { ascending: true });

  if (mode === "immediate" && immediateOrderId) {
    query = query.eq("id", immediateOrderId);
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error("orders_missing_phone query failed", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const grouped = new Map<string, MissingOrderRow[]>();
  for (const r of (rows || []) as MissingOrderRow[]) {
    if (!r.sales_person_id) continue;
    const list = grouped.get(r.sales_person_id) || [];
    list.push(r);
    grouped.set(r.sales_person_id, list);
  }

  const results: any[] = [];

  for (const [salesPersonId, salesOrders] of grouped.entries()) {
    // De-dup: skip if we've nudged this salesperson in the last 24h (daily mode)
    if (mode === "daily") {
      const { data: recent } = await supabase
        .from("domain_events")
        .select("id")
        .eq("event_type", "salesperson.missing_phone_nudged")
        .eq("entity_type", "user")
        .eq("entity_id", salesPersonId)
        .gte("created_at", new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString())
        .limit(1);
      if (recent && recent.length > 0) {
        results.push({ salesPersonId, skipped: "recently_nudged" });
        continue;
      }
    }

    // Look up salesperson's WhatsApp number from employees.phone
    const { data: emp } = await supabase
      .from("employees")
      .select("phone, name")
      .eq("user_id", salesPersonId)
      .maybeSingle();

    const phone = emp?.phone;
    const name = emp?.name || salesOrders[0].sales_person_name || "there";

    if (!phone) {
      results.push({ salesPersonId, skipped: "no_phone_on_employee_record" });
      continue;
    }

    let whatsappResult: any = { skipped: "no_interakt_key" };
    if (INTERAKT_API_KEY) {
      whatsappResult = await sendWhatsApp(
        INTERAKT_API_KEY,
        phone,
        INTERAKT_TEMPLATE,
        [name, String(salesOrders.length), salesOrders[0].order_number],
      );
    }

    await supabase.from("domain_events").insert({
      event_type: "salesperson.missing_phone_nudged",
      entity_type: "user",
      entity_id: salesPersonId,
      payload: {
        mode,
        order_count: salesOrders.length,
        order_numbers: salesOrders.map((o) => o.order_number),
        whatsapp: whatsappResult,
        template: INTERAKT_TEMPLATE,
      },
      processed: true,
      processed_at: new Date().toISOString(),
    });

    results.push({
      salesPersonId,
      name,
      orderCount: salesOrders.length,
      whatsapp: whatsappResult,
    });
  }

  return new Response(
    JSON.stringify({ ok: true, mode, total_orders: rows?.length || 0, results }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});