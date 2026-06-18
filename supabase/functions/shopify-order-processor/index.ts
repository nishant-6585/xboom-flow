import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAuthorizedCron } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_RETRIES = 5;
const BATCH_SIZE = 100;

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function mapShopifyToShopifyOrder(
  payload: Record<string, unknown>,
  shopDomain: string
) {
  const customer = (payload.customer as Record<string, unknown>) || {};
  const lineItems = (payload.line_items as Array<Record<string, unknown>>) || [];
  const shippingAddress = extractShippingAddress(payload);

  const primaryItem = lineItems[0] || {};
  const totalQuantity = lineItems.reduce(
    (sum: number, item: Record<string, unknown>) => sum + (Number(item.quantity) || 0),
    0
  );

  const lineItemsSummary = lineItems
    .map(
      (item: Record<string, unknown>) =>
        `${item.title} x${item.quantity} @ ${item.price}`
    )
    .join("; ");

  const customerName = String(
    `${customer.first_name || ""} ${customer.last_name || ""}`.trim() ||
      (payload.shipping_address as Record<string, unknown>)?.name ||
      `${(payload.shipping_address as Record<string, unknown>)?.first_name || ""} ${(payload.shipping_address as Record<string, unknown>)?.last_name || ""}`.trim() ||
      (payload.billing_address as Record<string, unknown>)?.name ||
      `${(payload.billing_address as Record<string, unknown>)?.first_name || ""} ${(payload.billing_address as Record<string, unknown>)?.last_name || ""}`.trim() ||
      payload.contact_email ||
      payload.email ||
      (customer.email as string) ||
      `Shopify Order ${payload.order_number}`
  );

  return {
    shopify_order_id: String(payload.id),
    shop_domain: shopDomain,
    order_number: String(payload.order_number || ""),
    product_name: String(primaryItem.title || "Shopify Order"),
    product_code: String(primaryItem.sku || primaryItem.product_id || `SHOP-${payload.order_number}`),
    product_category: "Consumer Drones",
    quantity: totalQuantity || 1,
    customer_name: customerName,
    customer_company: String(
      (customer.default_address as Record<string, unknown>)?.company ||
        (payload.shipping_address as Record<string, unknown>)?.company ||
        (payload.billing_address as Record<string, unknown>)?.company ||
        ""
    ),
    customer_email: String(payload.contact_email || payload.email || (customer.email as string) || ""),
    customer_phone: String(
      (payload.shipping_address as Record<string, unknown>)?.phone ||
      (customer.phone as string) ||
      ""
    ) || null,
    shipping_address: shippingAddress,
    selling_price: Number(payload.total_price) || 0,
    total_sales_amount: Number(payload.total_price) || 0,
    amount_paid: Number(payload.total_price) || 0,
    payment_status: mapPaymentStatus(payload.financial_status as string),
    fulfillment_status: String(payload.fulfillment_status || "unfulfilled"),
    financial_status: String(payload.financial_status || ""),
    order_status: String(payload.status || "open"),
    currency: String(payload.currency || "INR"),
    line_items: lineItems,
    internal_notes: `Shopify Order #${payload.order_number}\nItems: ${lineItemsSummary}`,
    sales_notes: null,
    tags: String(payload.tags || ""),
    shopify_created_at: payload.created_at ? String(payload.created_at) : null,
    shopify_updated_at: payload.updated_at ? String(payload.updated_at) : null,
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
      return "full";
    case "pending":
    case "authorized":
    default:
      return "pending";
  }
}

// ─── Inventory Sync ─────────────────────────────────────────────────────────

async function syncShopifyOrderToInventory(
  client: ReturnType<typeof createClient>,
  orderData: Record<string, unknown>,
  payload: Record<string, unknown>
) {
  // Check if sync is enabled
  const { data: syncSettings } = await client
    .from("inventory_sync_settings")
    .select("enable_shopify_sync")
    .limit(1)
    .single();

  if (!syncSettings?.enable_shopify_sync) return;

  const lineItems = (payload.line_items as Array<Record<string, unknown>>) || [];

  for (const lineItem of lineItems) {
    const productName = String(lineItem.title || "");
    const quantity = Number(lineItem.quantity) || 0;
    if (!productName || quantity <= 0) continue;

    // Find matching inventory item
    const { data: invItem } = await client
      .from("inventory")
      .select("id, current_stock")
      .ilike("product_name", productName)
      .limit(1)
      .single();

    if (!invItem) {
      console.log(`No inventory match for Shopify product: ${productName}`);
      continue;
    }

    // Check idempotency — avoid duplicate deductions
    const shopifyOrderId = String(payload.id);
    const { data: existing } = await client
      .from("inventory_transactions")
      .select("id")
      .eq("inventory_id", invItem.id)
      .eq("reference_number", `SHOPIFY-${shopifyOrderId}-${lineItem.id}`)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`Inventory transaction already exists for Shopify line item ${lineItem.id}`);
      continue;
    }

    // Create inventory transaction (negative = stock out)
    await client.from("inventory_transactions").insert({
      inventory_id: invItem.id,
      transaction_type: "order_fulfilled",
      quantity: -quantity,
      reference_number: `SHOPIFY-${shopifyOrderId}-${lineItem.id}`,
      notes: `Shopify Order #${payload.order_number} — ${productName} x${quantity}`,
    });

    console.log(`Inventory deducted: ${productName} x${quantity} (Shopify #${payload.order_number})`);
  }

  // Update last sync timestamp
  await client
    .from("inventory_sync_settings")
    .update({ last_sync_at: new Date().toISOString() })
    .neq("id", "00000000-0000-0000-0000-000000000000");
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
    // Require cron secret OR admin JWT — never expose internal stats publicly.
    const cronOk = await isAuthorizedCron(req);
    if (!cronOk) {
      const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
      if (!authHeader?.toLowerCase().startsWith("bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const token = authHeader.slice(7).trim();
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: isAdmin } = await serviceClient.rpc("has_role", {
        _user_id: userData.user.id,
        _role: "admin",
      });
      if (isAdmin !== true) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    const { data: stats } = await serviceClient.rpc("get_shopify_processing_stats");
    return new Response(JSON.stringify(stats || {}), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Fetch pending orders using row-level locking ─────────────────────────
  const { data: pendingOrders, error: fetchError } = await serviceClient
    .rpc("fetch_pending_shopify_orders", { batch_size: BATCH_SIZE });

  if (fetchError) {
    console.error("Failed to fetch pending orders:", fetchError.message);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!pendingOrders || pendingOrders.length === 0) {
    return new Response(
      JSON.stringify({ status: "idle", processed: 0 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`Processing ${pendingOrders.length} Shopify orders into shopify_orders table`);

  let successCount = 0;
  let failCount = 0;

  for (const raw of pendingOrders) {
    const rawId = raw.id;
    const shopDomain = raw.shop_domain;
    const shopifyOrderId = raw.order_id;
    const payload = raw.payload as Record<string, unknown>;
    const retryCount = raw.retry_count || 0;

    try {
      // Exponential backoff check
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

      const isUpdate = raw.webhook_topic === "orders/updated";
      const orderData = mapShopifyToShopifyOrder(payload, shopDomain);

      // Check if order already exists in shopify_orders table
      const { data: existingOrder } = await serviceClient
        .from("shopify_orders")
        .select("id")
        .eq("shop_domain", shopDomain)
        .eq("shopify_order_id", String(payload.id))
        .limit(1);

      if (existingOrder && existingOrder.length > 0) {
        if (isUpdate) {
          // Update existing shopify order
          const { error: updateError } = await serviceClient
            .from("shopify_orders")
            .update({
              customer_name: orderData.customer_name,
              customer_email: orderData.customer_email,
              customer_phone: orderData.customer_phone,
              shipping_address: orderData.shipping_address,
              selling_price: orderData.selling_price,
              total_sales_amount: orderData.total_sales_amount,
              amount_paid: orderData.amount_paid,
              payment_status: orderData.payment_status,
              fulfillment_status: orderData.fulfillment_status,
              financial_status: orderData.financial_status,
              order_status: orderData.order_status,
              line_items: orderData.line_items,
              shopify_updated_at: orderData.shopify_updated_at,
            })
            .eq("id", existingOrder[0].id);

          if (updateError) throw new Error(updateError.message);

          // ── Verification: re-fetch and confirm status fields match ──
          const { data: verifyRow, error: verifyError } = await serviceClient
            .from("shopify_orders")
            .select(
              "order_status, financial_status, fulfillment_status, payment_status, shopify_updated_at"
            )
            .eq("id", existingOrder[0].id)
            .maybeSingle();

          if (verifyError || !verifyRow) {
            throw new Error(
              `Post-update verification read failed: ${verifyError?.message ?? "row not found"}`
            );
          }

          const mismatches: string[] = [];
          const fieldsToCheck: Array<
            keyof typeof orderData & keyof typeof verifyRow
          > = [
            "order_status",
            "financial_status",
            "fulfillment_status",
            "payment_status",
            "shopify_updated_at",
          ];
          for (const field of fieldsToCheck) {
            const expected = (orderData as Record<string, unknown>)[field] ?? null;
            const actual = (verifyRow as Record<string, unknown>)[field] ?? null;
            // Timestamps may round-trip with a different TZ representation
            // (e.g. +05:30 vs UTC). Compare as instants for date fields.
            if (field === "shopify_updated_at") {
              const e = expected ? new Date(String(expected)).getTime() : null;
              const a = actual ? new Date(String(actual)).getTime() : null;
              if (e !== a) {
                mismatches.push(`${field}: expected=${expected} actual=${actual}`);
              }
              continue;
            }
            if (String(expected) !== String(actual)) {
              mismatches.push(`${field}: expected=${expected} actual=${actual}`);
            }
          }

          if (mismatches.length > 0) {
            throw new Error(
              `Status verification failed for order ${shopifyOrderId}: ${mismatches.join("; ")}`
            );
          }

          await serviceClient
            .from("shopify_orders_raw")
            .update({ processing_status: "completed", processed_at: new Date().toISOString(), last_error: null })
            .eq("id", rawId);

          successCount++;
          console.log(
            `Shopify order ${shopifyOrderId} updated in shopify_orders and verified (status=${verifyRow.order_status}, financial=${verifyRow.financial_status}, fulfillment=${verifyRow.fulfillment_status})`
          );
          continue;
        }

        // Already exists (idempotent)
        await serviceClient
          .from("shopify_orders_raw")
          .update({ processing_status: "completed", processed_at: new Date().toISOString(), last_error: null })
          .eq("id", rawId);

        successCount++;
        console.log(`Shopify order ${shopifyOrderId} already in shopify_orders, marked completed`);
        continue;
      }

      // Insert into shopify_orders table (NOT the orders table)
      const { error: insertError } = await serviceClient
        .from("shopify_orders")
        .insert(orderData);

      if (insertError) throw new Error(insertError.message);

      // ── Shopify → Inventory Sync ─────────────────────────────────────
      try {
        await syncShopifyOrderToInventory(serviceClient, orderData, payload);
      } catch (syncErr) {
        console.error(`Inventory sync failed for ${shopifyOrderId} (non-blocking):`, syncErr);
      }

      // Mark raw as completed
      await serviceClient
        .from("shopify_orders_raw")
        .update({ processing_status: "completed", processed_at: new Date().toISOString(), last_error: null })
        .eq("id", rawId);

      successCount++;
      console.log(`Shopify order ${shopifyOrderId} inserted into shopify_orders`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorType = classifyError(errorMsg);
      const newRetryCount = retryCount + 1;

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
        `Shopify order ${shopifyOrderId} failed (attempt ${newRetryCount}/${MAX_RETRIES}, ${errorType}): ${errorMsg}`
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
