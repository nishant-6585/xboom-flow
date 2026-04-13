import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Verify cron secret for scheduled calls
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");

  // Also allow authenticated users (admin) to trigger manually
  const authHeader = req.headers.get("Authorization");
  let isAuthorized = false;

  if (cronSecret && expectedSecret && cronSecret === expectedSecret) {
    isAuthorized = true;
  } else if (authHeader?.startsWith("Bearer ")) {
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (!error && data?.user?.id) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Parse optional query params from request body
  let hours = 48;
  let minTotal = 0;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body.hours && Number.isFinite(Number(body.hours))) hours = Number(body.hours);
      if (body.min_total && Number.isFinite(Number(body.min_total))) minTotal = Number(body.min_total);
    }
  } catch {
    // use defaults
  }

  try {
    // Build API endpoint - API key is optional
    const url = new URL("https://www.xboom.in/wp-json/xboom/v1/abandoned-carts");
    const apiKey = Deno.env.get("XBOOM_CART_API_KEY");
    if (apiKey) {
      url.searchParams.append("api_key", apiKey);
    }
    url.searchParams.append("hours", String(hours));
    url.searchParams.append("min_total", String(minTotal));

    console.log(`[sync-abandoned-carts] Fetching (hours=${hours}, min_total=${minTotal})`);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const rawText = await response.text();

    // Log raw response for debugging
    try {
      await supabase.from("domain_events").insert({
        entity_type: "abandoned_cart_sync",
        entity_id: crypto.randomUUID(),
        event_type: "abandoned_cart_sync_debug",
        payload: {
          status: response.status,
          body_preview: rawText.substring(0, 2000),
          url: url.toString().replace(/api_key=[^&]+/, "api_key=REDACTED"),
        },
      });
    } catch { /* ignore logging errors */ }

    if (!response.ok) {
      console.error(`[sync-abandoned-carts] API error [${response.status}]`);
      return new Response(
        JSON.stringify({ error: `WordPress API error: ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // API returns a root array directly, NOT { data: [] }
    const carts = JSON.parse(rawText);

    if (!Array.isArray(carts)) {
      console.error("[sync-abandoned-carts] Response is not an array");
      return new Response(
        JSON.stringify({ error: "Unexpected response format: expected array" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[sync-abandoned-carts] Received ${carts.length} abandoned carts`);

    let inserted = 0;
    let errors = 0;

    for (const cart of carts) {
      const sessionId = String(cart.session_id || "");
      if (!sessionId) {
        errors++;
        continue;
      }

      const record = {
        session_id: sessionId,
        customer_name: cart.customer_name || "Unknown",
        customer_email: cart.email?.trim()?.toLowerCase() || null,
        customer_phone: cart.phone || null,
        cart_items: cart.cart_items || null,
        cart_value: parseFloat(String(cart.cart_total || "0")) || 0,
        currency: "INR",
        status: "active",
        source: "xboom_website_pro",
      };

      const { error: upsertError } = await supabase
        .from("abandoned_carts")
        .upsert(record, { onConflict: "session_id", ignoreDuplicates: false });

      if (upsertError) {
        errors++;
        console.error(`[sync-abandoned-carts] Upsert error for ${sessionId}:`, upsertError.message);
      } else {
        inserted++;
      }
    }

    const summary = {
      success: true,
      total_fetched: carts.length,
      inserted,
      errors,
      synced_at: new Date().toISOString(),
    };

    console.log(`[sync-abandoned-carts] Sync complete:`, JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[sync-abandoned-carts] Unexpected error:", err);

    try {
      await supabase.from("domain_events").insert({
        entity_type: "abandoned_cart_sync",
        entity_id: crypto.randomUUID(),
        event_type: "sync_unexpected_error",
        payload: { error: String(err) },
      });
    } catch { /* ignore */ }

    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
