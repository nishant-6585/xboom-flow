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

  const siteUrl = Deno.env.get("WC_SITE_URL");
  const consumerKey = Deno.env.get("WC_CONSUMER_KEY");
  const consumerSecret = Deno.env.get("WC_CONSUMER_SECRET");

  if (!siteUrl || !consumerKey || !consumerSecret) {
    console.error("[sync-abandoned-carts] Missing WC_SITE_URL, WC_CONSUMER_KEY, or WC_CONSUMER_SECRET");
    return new Response(JSON.stringify({ error: "WooCommerce credentials not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Fetch abandoned carts from custom WordPress REST endpoint
    const endpoint = `${siteUrl.replace(/\/$/, "")}/wp-json/xboom/v1/abandoned-carts`;
    const credentials = btoa(`${consumerKey}:${consumerSecret}`);

    console.log(`[sync-abandoned-carts] Fetching from ${endpoint}`);

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[sync-abandoned-carts] API error [${response.status}]: ${errorText}`);
      return new Response(
        JSON.stringify({ error: `WordPress API error: ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const carts = await response.json();

    if (!Array.isArray(carts)) {
      console.error("[sync-abandoned-carts] Unexpected response format:", typeof carts);
      return new Response(
        JSON.stringify({ error: "Unexpected response format from WordPress" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[sync-abandoned-carts] Received ${carts.length} abandoned carts`);

    let inserted = 0;
    let duplicates = 0;
    let errors = 0;

    for (const cart of carts) {
      const customerEmail = cart.email?.trim()?.toLowerCase() || null;
      const sessionId = cart.session_id || cart.id?.toString() || null;

      // Build dedup key: prefer session_id, fallback to email + created_at
      const dedupSessionId = sessionId || `${customerEmail}-${cart.created_at}`;

      const record = {
        session_id: dedupSessionId,
        customer_name: cart.customer_name || "Unknown",
        customer_email: customerEmail,
        customer_phone: cart.phone || null,
        cart_items: cart.cart_items || cart.items || null,
        cart_value: parseFloat(cart.cart_total || cart.cart_value || "0") || 0,
        currency: cart.currency || "INR",
        status: "active",
        source: "cartbounty",
      };

      // Upsert using session_id as dedup key
      const { error: upsertError } = await supabase
        .from("abandoned_carts")
        .upsert(record, { onConflict: "session_id", ignoreDuplicates: true });

      if (upsertError) {
        if (upsertError.code === "23505") {
          duplicates++;
          console.log(`[sync-abandoned-carts] Duplicate skipped: ${dedupSessionId}`);
        } else {
          errors++;
          console.error(`[sync-abandoned-carts] Insert error:`, upsertError.message);
        }
      } else {
        inserted++;
      }
    }

    const summary = {
      success: true,
      total_fetched: carts.length,
      inserted,
      duplicates,
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
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
