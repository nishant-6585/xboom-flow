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
  let hours = 168;
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
    const baseUrl = "https://www.xboom.in/wp-json/xboom/v1/abandoned-carts";
    const apiKey = Deno.env.get("XBOOM_CART_API_KEY") || "xboom_default_secret_key_123";

    const url = new URL(baseUrl);
    url.searchParams.append("token", apiKey);

    console.log(`[sync-abandoned-carts] Fetching from WordPress API`);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const rawText = await response.text();

    try {
      await supabase.from("domain_events").insert({
        entity_type: "abandoned_cart_sync",
        entity_id: crypto.randomUUID(),
        event_type: "abandoned_cart_sync_debug",
        payload: {
          status: response.status,
          body_preview: rawText.substring(0, 2000),
          url: url.toString().replace(/token=[^&]+/, "token=REDACTED"),
        },
      });
    } catch { /* ignore */ }

    if (!response.ok) {
      console.error(`[sync-abandoned-carts] API error [${response.status}]`);
      return new Response(
        JSON.stringify({
          success: false,
          total_fetched: 0,
          inserted: 0,
          errors: 0,
          upstream_status: response.status,
          message: "Abandoned carts source is currently unavailable",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // API returns { status: "success", count: N, data: [...] }
    const parsed = JSON.parse(rawText);
    const carts = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : null;

    if (!carts) {
      console.error("[sync-abandoned-carts] Unexpected response format");
      return new Response(
        JSON.stringify({ error: "Unexpected response format" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    const filteredCarts = carts.filter((cart: any) => {
      const abandonedAt = new Date(cart.abandoned_at || cart.created_at || 0).getTime();
      const total = parseFloat(String(cart.cart_total || cart.total || "0")) || 0;
      return (abandonedAt ? abandonedAt >= cutoff : true) && total >= minTotal;
    });

    console.log(`[sync-abandoned-carts] Received ${carts.length} carts, processing ${filteredCarts.length} after local filtering`);

    let inserted = 0;
    let errors = 0;

    for (const cart of filteredCarts) {
      // API returns: id, email, cart_total, abandoned_at, products[]
      const sessionId = String(cart.id || cart.session_id || "");
      if (!sessionId) {
        errors++;
        continue;
      }

      const cartValue = parseFloat(String(cart.cart_total || "0")) || 0;
      const record = {
        session_id: sessionId,
        customer_name: cart.email?.trim() || "Guest",
        customer_email: cart.email?.trim()?.toLowerCase() || null,
        customer_phone: null,
        cart_items: cart.products || cart.cart_items || null,
        cart_value: cartValue,
        currency: "INR",
        status: "active",
        source: "xboom_website_pro",
        created_at: cart.abandoned_at || new Date().toISOString(),
        priority: cartValue > 10000 ? "high" : "normal",
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
      total_fetched: filteredCarts.length,
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
