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
    const { data, error } = await supabaseAuth.auth.getClaims(token);
    if (!error && data?.claims?.sub) {
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

  const apiKey = Deno.env.get("XBOOM_CART_API_KEY");
  if (!apiKey) {
    console.error("[sync-abandoned-carts] Missing XBOOM_CART_API_KEY secret");
    return new Response(JSON.stringify({ error: "Cart API key not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Build PRO API endpoint with query params
    const endpoint = `https://www.xboom.in/wp-json/xboom/v1/abandoned-carts?api_key=${encodeURIComponent(apiKey)}&hours=${hours}&min_total=${minTotal}`;

    console.log(`[sync-abandoned-carts] Fetching from PRO API (hours=${hours}, min_total=${minTotal})`);

    const response = await fetch(endpoint, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[sync-abandoned-carts] API error [${response.status}]: ${errorText}`);

      // Log failure to domain_events
      await supabase.from("domain_events").insert({
        entity_type: "abandoned_cart_sync",
        entity_id: crypto.randomUUID(),
        event_type: "sync_api_error",
        payload: { status: response.status, error: errorText.substring(0, 500) },
      });

      return new Response(
        JSON.stringify({ error: `WordPress API error: ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const responseBody = await response.json();

    // Handle PRO API error response
    if (responseBody.status === "error") {
      console.error("[sync-abandoned-carts] PRO API returned error:", JSON.stringify(responseBody));

      await supabase.from("domain_events").insert({
        entity_type: "abandoned_cart_sync",
        entity_id: crypto.randomUUID(),
        event_type: "sync_api_returned_error",
        payload: responseBody,
      });

      return new Response(
        JSON.stringify({ error: "PRO API returned error status", details: responseBody }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse PRO API format: { status: "success", count: N, data: [...] }
    const carts = responseBody.data;

    if (!Array.isArray(carts)) {
      console.error("[sync-abandoned-carts] Unexpected response format: missing data array");
      return new Response(
        JSON.stringify({ error: "Unexpected response format from PRO API" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[sync-abandoned-carts] Received ${carts.length} abandoned carts (API count: ${responseBody.count})`);

    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const cart of carts) {
      const cartId = String(cart.cart_id);
      const customerEmail = cart.email?.trim()?.toLowerCase() || null;

      const record = {
        session_id: cartId,
        customer_name: customerEmail ? customerEmail.split("@")[0] : "Unknown",
        customer_email: customerEmail,
        customer_phone: cart.phone || null,
        cart_items: cart.products || null,
        cart_value: parseFloat(String(cart.total || "0")) || 0,
        currency: "INR",
        status: "active",
        source: "xboom_website_pro",
      };

      // Upsert using session_id (= cart_id) as dedup key
      const { error: upsertError } = await supabase
        .from("abandoned_carts")
        .upsert(record, { onConflict: "session_id", ignoreDuplicates: false });

      if (upsertError) {
        errors++;
        console.error(`[sync-abandoned-carts] Upsert error for cart_id ${cartId}:`, upsertError.message);
      } else {
        inserted++;
      }
    }

    const summary = {
      success: true,
      total_fetched: carts.length,
      inserted,
      updated,
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

    // Log to domain_events
    await supabase.from("domain_events").insert({
      entity_type: "abandoned_cart_sync",
      entity_id: crypto.randomUUID(),
      event_type: "sync_unexpected_error",
      payload: { error: String(err) },
    }).catch(() => {});

    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
