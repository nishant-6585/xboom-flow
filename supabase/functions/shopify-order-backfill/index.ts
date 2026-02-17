import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function extractShippingAddress(payload: Record<string, unknown>): string | null {
  const addr = payload.shipping_address as Record<string, unknown> | null;
  if (!addr) return null;
  const parts = [addr.address1, addr.address2, addr.city, addr.province, addr.zip, addr.country].filter(Boolean);
  return parts.join(", ") || null;
}

function mapPaymentStatus(financialStatus: string | undefined): string {
  switch (financialStatus) {
    case "paid": return "full";
    case "partially_paid": return "partial";
    default: return "pending";
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const storeDomain = Deno.env.get('SHOPIFY_STORE_DOMAIN');
    const adminToken = Deno.env.get('SHOPIFY_ADMIN_API_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!storeDomain || !adminToken) {
      return new Response(JSON.stringify({ error: 'Missing Shopify credentials' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // Fetch orders from Shopify (up to 50)
    const apiUrl = `https://${storeDomain}/admin/api/2025-01/orders.json?limit=50&status=any`;
    console.log(`Fetching orders from: ${apiUrl}`);

    const response = await fetch(apiUrl, {
      headers: {
        'X-Shopify-Access-Token': adminToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: 'Shopify API error', status: response.status, details: errorText }), {
        status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const shopifyOrders = data.orders || [];
    console.log(`Fetched ${shopifyOrders.length} orders from Shopify`);

    // Get admin user for sales_person_id and created_by
    const { data: adminUser } = await serviceClient
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1);

    if (!adminUser || adminUser.length === 0) {
      return new Response(JSON.stringify({ error: 'No admin user found to assign orders' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminId = adminUser[0].user_id;
    const { data: adminProfile } = await serviceClient
      .from("profiles")
      .select("name")
      .eq("user_id", adminId)
      .limit(1);
    const adminName = adminProfile?.[0]?.name || "System";

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const order of shopifyOrders) {
      const shopifyOrderNum = order.order_number || order.id;
      const leadSource = `shopify:${storeDomain}`;

      // Check if already imported (dedup by lead_source + internal_notes containing order number)
      const { data: existing } = await serviceClient
        .from("orders")
        .select("id")
        .eq("lead_source", leadSource)
        .ilike("internal_notes", `%Shopify Order #${shopifyOrderNum}%`)
        .limit(1);

      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }

      // Map Shopify order to our orders table
      const customer = order.customer || {};
      const lineItems = order.line_items || [];
      const primaryItem = lineItems[0] || {};
      const totalQuantity = lineItems.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0);
      const lineItemsSummary = lineItems.map((item: any) => `${item.title} x${item.quantity} @ ${item.price}`).join("; ");

      const orderData = {
        product_name: String(primaryItem.title || "Shopify Order"),
        product_code: String(primaryItem.sku || primaryItem.product_id || `SHOP-${shopifyOrderNum}`),
        product_category: "Consumer Drones",
        quantity: totalQuantity || 1,
        customer_name: String(`${customer.first_name || ""} ${customer.last_name || ""}`.trim() || order.contact_email || "Shopify Customer"),
        customer_company: String(customer.default_address?.company || ""),
        customer_email: String(order.contact_email || order.email || ""),
        customer_type: "b2c",
        shipping_address: extractShippingAddress(order),
        selling_price: Number(order.total_price) || 0,
        total_sales_amount: Number(order.total_price) || 0,
        amount_paid: Number(order.total_price) || 0,
        payment_status: mapPaymentStatus(order.financial_status),
        order_type: "prepaid",
        status: "po_received",
        lead_source: leadSource,
        internal_notes: `Shopify Order #${shopifyOrderNum}\nItems: ${lineItemsSummary}`,
        sales_notes: `Fulfillment: ${order.fulfillment_status || "unfulfilled"}`,
        sales_person_id: adminId,
        sales_person_name: adminName,
        created_by: adminId,
      };

      const { error: insertError } = await serviceClient.from("orders").insert(orderData);

      if (insertError) {
        failed++;
        errors.push(`Order #${shopifyOrderNum}: ${insertError.message}`);
        console.error(`Failed to import order #${shopifyOrderNum}:`, insertError.message);
      } else {
        imported++;
        console.log(`Imported Shopify order #${shopifyOrderNum}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total_fetched: shopifyOrders.length,
      imported,
      skipped,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Backfill error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
