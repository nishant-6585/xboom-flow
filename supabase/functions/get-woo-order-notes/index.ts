// Fetch WooCommerce notes (customer + private) for a single order.
// Read-only proxy — sales staff use it to enrich the lead activity log.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const WC_SITE_URL = (Deno.env.get("WC_SITE_URL") || "https://xboom.in").replace(/\/$/, "");
const WC_KEY = Deno.env.get("WC_CONSUMER_KEY") || "";
const WC_SECRET = Deno.env.get("WC_CONSUMER_SECRET") || "";
const WC_AUTH = "Basic " + btoa(`${WC_KEY}:${WC_SECRET}`);

interface WooNote {
  id: number;
  author: string;
  date_created_gmt: string;
  note: string;
  customer_note: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Restrict to internal roles that legitimately need WooCommerce order notes
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const allowed = new Set(["admin", "sales", "sales_manager", "supply_chain", "finance"]);
    if (!roles?.some((r: { role: string }) => allowed.has(r.role))) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const wooOrderId = String(body?.woo_order_id ?? "").trim();
    if (!/^\d{1,12}$/.test(wooOrderId)) {
      return new Response(JSON.stringify({ error: "invalid woo_order_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!WC_KEY || !WC_SECRET) {
      return new Response(
        JSON.stringify({ notes: [], warning: "WC credentials not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const url = `${WC_SITE_URL}/wp-json/wc/v3/orders/${wooOrderId}/notes?per_page=50&type=any`;
    const wcRes = await fetch(url, { headers: { Authorization: WC_AUTH } });
    if (!wcRes.ok) {
      const text = await wcRes.text();
      console.error("[get-woo-order-notes] WC error", wcRes.status, text.slice(0, 300));
      return new Response(
        JSON.stringify({ notes: [], error: `WC ${wcRes.status}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const raw = (await wcRes.json()) as WooNote[];
    const notes = (raw || []).map((n) => ({
      id: n.id,
      author: n.author || "WooCommerce",
      date: n.date_created_gmt ? `${n.date_created_gmt}Z` : new Date().toISOString(),
      note: (n.note || "").replace(/<[^>]+>/g, "").trim(),
      customer_note: !!n.customer_note,
    }));

    return new Response(JSON.stringify({ notes }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[get-woo-order-notes] fatal", e);
    return new Response(JSON.stringify({ error: "internal" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});