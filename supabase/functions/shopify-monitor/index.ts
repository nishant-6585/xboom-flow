import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Auth: require admin JWT ────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Validate the JWT and get claims
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);

  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = claimsData.claims.sub;

  // Check admin role using service client (bypasses RLS for role check)
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: roleData, error: roleError } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (roleError || !roleData) {
    return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Aggregate metrics — no joins, index-friendly counts ───────────────────
  try {
    const [
      pendingRes,
      failedRes,
      processingRes,
      completedRes,
      lastProcessedRes,
      lastWebhookRes,
      oldestPendingRes,
    ] = await Promise.all([
      serviceClient
        .from("shopify_orders_raw")
        .select("id", { count: "exact", head: true })
        .eq("processing_status", "pending"),
      serviceClient
        .from("shopify_orders_raw")
        .select("id", { count: "exact", head: true })
        .eq("processing_status", "failed"),
      serviceClient
        .from("shopify_orders_raw")
        .select("id", { count: "exact", head: true })
        .eq("processing_status", "processing"),
      serviceClient
        .from("shopify_orders_raw")
        .select("id", { count: "exact", head: true })
        .eq("processing_status", "completed"),
      serviceClient
        .from("shopify_orders_raw")
        .select("processed_at")
        .eq("processing_status", "completed")
        .order("processed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      serviceClient
        .from("shopify_orders_raw")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      serviceClient
        .from("shopify_orders_raw")
        .select("created_at")
        .eq("processing_status", "pending")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    const pendingCount = pendingRes.count ?? 0;
    const failedCount = failedRes.count ?? 0;
    const processingCount = processingRes.count ?? 0;
    const completedCount = completedRes.count ?? 0;
    const lastProcessedAt = lastProcessedRes.data?.processed_at ?? null;
    const lastWebhookReceivedAt = lastWebhookRes.data?.created_at ?? null;

    // Calculate oldest pending age in seconds
    let oldestPendingAgeSeconds: number | null = null;
    if (oldestPendingRes.data?.created_at) {
      const oldestCreatedAt = new Date(oldestPendingRes.data.created_at).getTime();
      oldestPendingAgeSeconds = Math.floor((Date.now() - oldestCreatedAt) / 1000);
    }

    // ── Determine health status ────────────────────────────────────────────
    let status: "healthy" | "degraded" | "warning" = "healthy";
    if (failedCount > 0) {
      status = "degraded";
    } else if (oldestPendingAgeSeconds !== null && oldestPendingAgeSeconds > 600) {
      status = "warning";
    }

    const response = {
      status,
      metrics: {
        pending_count: pendingCount,
        failed_count: failedCount,
        processing_count: processingCount,
        completed_count: completedCount,
        last_processed_at: lastProcessedAt,
        last_webhook_received_at: lastWebhookReceivedAt,
        oldest_pending_age_seconds: oldestPendingAgeSeconds,
      },
      checked_at: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("shopify-monitor error:", msg);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
