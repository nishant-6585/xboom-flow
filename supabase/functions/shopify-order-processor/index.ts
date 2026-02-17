import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_RETRIES = 5;
const BATCH_SIZE = 100;

// ─── Helpers ────────────────────────────────────────────────────────────────

function shouldRetry(retryCount: number): boolean {
  if (retryCount >= MAX_RETRIES) return false;
  // Exponential backoff: 2^retry * 60 seconds (2min, 4min, 8min, 16min, 32min)
  // The cron runs every 2 min, so we check if enough time has elapsed
  return true;
}

function classifyError(error: string): "temporary" | "permanent" {
  const permanentPatterns = [
    "violates not-null constraint",
    "violates unique constraint",
    "invalid input syntax",
    "value too long",
    "violates check constraint",
  ];
  for (const pattern of permanentPatterns) {
    if (error.toLowerCase().includes(pattern)) return "permanent";
  }
  return "temporary";
}

function extractShippingAddress(payload: Record<string, unknown>): string | null {
  const addr = payload.shipping_address as Record<string, unknown> | null;
  if (!addr) return null;
  const parts = [
    addr.address1,
    addr.address2,
    addr.city,
    addr.province,
    addr.zip,
    addr.country,
  ].filter(Boolean);
  return parts.join(", ") || null;
}

function mapShopifyToOrder(
  payload: Record<string, unknown>,
  shopDomain: string
) {
  const customer = (payload.customer as Record<string, unknown>) || {};
  const lineItems = (payload.line_items as Array<Record<string, unknown>>) || [];
  const shippingAddress = extractShippingAddress(payload);

  // Build product info from first line item (primary product)
  const primaryItem = lineItems[0] || {};
  const totalQuantity = lineItems.reduce(
    (sum: number, item: Record<string, unknown>) => sum + (Number(item.quantity) || 0),
    0
  );

  // Build line items summary for notes
  const lineItemsSummary = lineItems
    .map(
      (item: Record<string, unknown>) =>
        `${item.title} x${item.quantity} @ ${item.price}`
    )
    .join("; ");

  return {
    product_name: String(primaryItem.title || "Shopify Order"),
    product_code: String(primaryItem.sku || primaryItem.product_id || `SHOP-${payload.order_number}`),
    product_category: "Consumer Drones", // Default, can be refined later
    quantity: totalQuantity || 1,
    customer_name: String(
      `${customer.first_name || ""} ${customer.last_name || ""}`.trim() ||
        payload.contact_email ||
        "Shopify Customer"
    ),
    customer_company: String(customer.default_address
      ? (customer.default_address as Record<string, unknown>).company || ""
      : ""),
    customer_email: String(payload.contact_email || payload.email || ""),
    customer_type: "b2c" as const,
    shipping_address: shippingAddress,
    selling_price: Number(payload.total_price) || 0,
    total_sales_amount: Number(payload.total_price) || 0,
    amount_paid: Number(payload.total_price) || 0,
    payment_status: mapPaymentStatus(payload.financial_status as string),
    order_type: "prepaid" as const,
    status: "po_received" as const,
    lead_source: `shopify:${shopDomain}`,
    internal_notes: `Shopify Order #${payload.order_number}\nItems: ${lineItemsSummary}`,
    sales_notes: `Fulfillment: ${payload.fulfillment_status || "unfulfilled"}`,
  };
}

function mapPaymentStatus(financialStatus: string | undefined): string {
  switch (financialStatus) {
    case "paid":
      return "full";
    case "partially_paid":
      return "partial";
    case "refunded":
    case "partially_refunded":
    case "voided":
      return "full"; // treat completed financial states as full
    case "pending":
    case "authorized":
    default:
      return "pending";
  }
}

// ─── Main Processor ─────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  // ── Monitoring endpoint ───────────────────────────────────────────────────
  const url = new URL(req.url);
  if (url.searchParams.get("action") === "status") {
    const { data: stats } = await serviceClient.rpc("get_shopify_processing_stats");
    return new Response(JSON.stringify(stats || {}), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Fetch pending orders using raw SQL for FOR UPDATE SKIP LOCKED ─────────
  // We use a database function for row-level locking
  const { data: pendingOrders, error: fetchError } = await serviceClient
    .rpc("fetch_pending_shopify_orders", { batch_size: BATCH_SIZE });

  if (fetchError) {
    console.error("Failed to fetch pending orders:", fetchError.message);
    return new Response(
      JSON.stringify({ error: "Fetch error", details: fetchError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!pendingOrders || pendingOrders.length === 0) {
    return new Response(
      JSON.stringify({ status: "idle", processed: 0 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`Processing ${pendingOrders.length} Shopify orders`);

  let successCount = 0;
  let failCount = 0;

  for (const raw of pendingOrders) {
    const rawId = raw.id;
    const shopDomain = raw.shop_domain;
    const shopifyOrderId = raw.order_id;
    const payload = raw.payload as Record<string, unknown>;
    const retryCount = raw.retry_count || 0;

    try {
      // Check exponential backoff: skip if not enough time elapsed
      if (retryCount > 0) {
        const backoffSeconds = Math.pow(2, retryCount) * 60;
        const lastAttempt = new Date(raw.updated_at || raw.created_at);
        const elapsed = (Date.now() - lastAttempt.getTime()) / 1000;
        if (elapsed < backoffSeconds) {
          console.log(
            `Skipping order ${shopifyOrderId}: backoff ${Math.round(backoffSeconds - elapsed)}s remaining`
          );
          continue;
        }
      }

      // Check for existing order (for updates or dedup)
      const { data: existingOrder } = await serviceClient
        .from("orders")
        .select("id")
        .eq("lead_source", `shopify:${shopDomain}`)
        .ilike("internal_notes", `%Shopify Order #${payload.order_number}%`)
        .limit(1);

      const isUpdate = raw.webhook_topic === "orders/updated";

      if (existingOrder && existingOrder.length > 0) {
        if (isUpdate) {
          // Update existing order with latest data from Shopify
          const orderData = mapShopifyToOrder(payload, shopDomain);
          const { error: updateError } = await serviceClient
            .from("orders")
            .update({
              customer_name: orderData.customer_name,
              customer_email: orderData.customer_email,
              shipping_address: orderData.shipping_address,
              selling_price: orderData.selling_price,
              total_sales_amount: orderData.total_sales_amount,
              amount_paid: orderData.amount_paid,
              payment_status: orderData.payment_status,
              sales_notes: orderData.sales_notes,
              internal_notes: orderData.internal_notes,
            })
            .eq("id", existingOrder[0].id);

          if (updateError) {
            throw new Error(updateError.message);
          }

          // Mark raw as completed
          await serviceClient
            .from("shopify_orders_raw")
            .update({
              processing_status: "completed",
              processed_at: new Date().toISOString(),
              last_error: null,
            })
            .eq("id", rawId);
          successCount++;
          console.log(`Order ${shopifyOrderId} updated successfully`);
          continue;
        }

        // Already processed (idempotent for creates), mark completed
        await serviceClient
          .from("shopify_orders_raw")
          .update({
            processing_status: "completed",
            processed_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", rawId);
        successCount++;
        console.log(`Order ${shopifyOrderId} already exists, marked completed`);
        continue;
      }

      // Map and insert
      const orderData = mapShopifyToOrder(payload, shopDomain);

      // We need a sales_person_id and created_by — use the first admin
      const { data: adminUser } = await serviceClient
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin")
        .limit(1);

      if (!adminUser || adminUser.length === 0) {
        throw new Error("No admin user found to assign Shopify orders");
      }

      const adminId = adminUser[0].user_id;

      // Get admin name
      const { data: adminProfile } = await serviceClient
        .from("profiles")
        .select("name")
        .eq("user_id", adminId)
        .limit(1);

      const adminName = adminProfile?.[0]?.name || "System";

      const { error: insertError } = await serviceClient
        .from("orders")
        .insert({
          ...orderData,
          sales_person_id: adminId,
          sales_person_name: "Shopify",
          created_by: adminId,
        });

      if (insertError) {
        throw new Error(insertError.message);
      }

      // Mark as completed
      await serviceClient
        .from("shopify_orders_raw")
        .update({
          processing_status: "completed",
          processed_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", rawId);

      successCount++;
      console.log(`Order ${shopifyOrderId} processed successfully`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorType = classifyError(errorMsg);
      const newRetryCount = retryCount + 1;

      // Permanent errors or max retries: mark failed
      const newStatus =
        errorType === "permanent" || newRetryCount >= MAX_RETRIES
          ? "failed"
          : "pending";

      await serviceClient
        .from("shopify_orders_raw")
        .update({
          processing_status: newStatus,
          retry_count: newRetryCount,
          last_error: `[${errorType}] ${errorMsg}`.substring(0, 1000),
        })
        .eq("id", rawId);

      failCount++;
      console.error(
        `Order ${shopifyOrderId} failed (attempt ${newRetryCount}/${MAX_RETRIES}, ${errorType}): ${errorMsg}`
      );
    }
  }

  const result = {
    status: "processed",
    success: successCount,
    failed: failCount,
    total: pendingOrders.length,
  };

  console.log(`Processing complete: ${JSON.stringify(result)}`);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
