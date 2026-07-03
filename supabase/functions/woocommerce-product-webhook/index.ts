import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyWooSignature } from "../_shared/woo-hmac.ts";
import { handleWooProductDelete, upsertWooProduct } from "../_shared/woo-product-map.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-wc-webhook-topic, x-wc-webhook-signature, x-wc-webhook-source, xboom_secret",
};

// deno-lint-ignore no-explicit-any
async function withStorefrontPrice(wcUrl: string | undefined, product: any): Promise<any> {
  const wooId = Number(product?.id);
  if (!wcUrl || !wooId || Number.isNaN(wooId)) return product;

  try {
    const base = wcUrl.replace(/\/$/, "");
    const resp = await fetch(`${base}/wp-json/wc/store/v1/products/${wooId}`, {
      headers: { "User-Agent": "Xboom-Workflow/1.0" },
    });
    if (!resp.ok) {
      console.warn(`[woocommerce-product-webhook] Store API price probe failed: ${resp.status}`);
      return product;
    }
    const storefront = await resp.json();
    return { ...product, prices: storefront?.prices, permalink: storefront?.permalink || product?.permalink };
  } catch (e) {
    console.warn("[woocommerce-product-webhook] Store API price probe failed", e);
    return product;
  }
}

/**
 * Receives HMAC-verified WooCommerce PRODUCT webhooks (product.created /
 * product.updated / product.deleted) from xboom.in and syncs them into the
 * `pricelist` table. Mirrors the order webhook's security model.
 *
 * Configure the Woo webhook with the same WOOCOMMERCE_WEBHOOK_SECRET used for
 * orders. Topics: "Product created", "Product updated", "Product deleted".
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    const topic = req.headers.get("x-wc-webhook-topic") || "unknown";
    const signature = req.headers.get("x-wc-webhook-signature");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // WooCommerce sends a form-encoded ping when the webhook is first saved.
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const body = await req.text();
      console.log(`[woocommerce-product-webhook] Ping received: ${body.slice(0, 200)}`);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.text();

    const hmacSecret = Deno.env.get("WOOCOMMERCE_WEBHOOK_SECRET");
    if (!hmacSecret) {
      console.error("[woocommerce-product-webhook] WOOCOMMERCE_WEBHOOK_SECRET not configured");
      return new Response(JSON.stringify({ success: false, error: "server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ok = await verifyWooSignature(rawBody, signature, hmacSecret);
    if (!ok) {
      console.warn("[woocommerce-product-webhook] HMAC verification FAILED");
      await supabase.from("woo_sync_logs").insert({
        event_type: "product_hmac_fail",
        direction: "in",
        status: "failed",
        error_message: "Invalid HMAC signature",
        payload: { topic, has_sig: !!signature },
      });
      return new Response(JSON.stringify({ success: false, error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.parse(rawBody);
    const wooId = Number(payload?.id);
    console.log(`[woocommerce-product-webhook] topic=${topic} product_id=${wooId || "N/A"}`);

    // Probe the Woo store tax setting once per request so we can stamp
    // website_price_includes_gst correctly on the synced row.
    let pricesIncludeTax: boolean | undefined = undefined;
    const wcUrl = Deno.env.get("WC_SITE_URL");
    const wcKey = Deno.env.get("WC_CONSUMER_KEY");
    const wcSecret = Deno.env.get("WC_CONSUMER_SECRET");
    let weightUnit: string | undefined = undefined;
    if (wcUrl && wcKey && wcSecret) {
      try {
        const base = wcUrl.replace(/\/$/, "");
        const auth = btoa(`${wcKey}:${wcSecret}`);
        const settingResp = await fetch(
          `${base}/wp-json/wc/v3/settings/tax/woocommerce_prices_include_tax`,
          { headers: { Authorization: `Basic ${auth}` } },
        );
        if (settingResp.ok) {
          const s = await settingResp.json();
          pricesIncludeTax = String(s?.value || "").toLowerCase() === "yes";
        }
        const wuResp = await fetch(
          `${base}/wp-json/wc/v3/settings/products/woocommerce_weight_unit`,
          { headers: { Authorization: `Basic ${auth}` } },
        );
        if (wuResp.ok) {
          const s = await wuResp.json();
          weightUnit = String(s?.value || "kg").toLowerCase();
        }
      } catch (e) {
        console.warn("[woocommerce-product-webhook] store setting probe failed", e);
      }
    }

    if (topic === "product.created" || topic === "product.updated") {
      const productPayload = await withStorefrontPrice(wcUrl, payload);
      const result = await upsertWooProduct(supabase, productPayload, "woocommerce_webhook", pricesIncludeTax, weightUnit);
      await supabase.from("woo_sync_logs").insert({
        event_type: "product_webhook_in",
        direction: "in",
        status: result.action === "skipped" ? "skipped" : "success",
        woo_status: topic,
        error_message: result.reason || null,
        payload: { woo_product_id: wooId, name: payload?.name, action: result.action },
      });
      console.log(`[woocommerce-product-webhook] product ${wooId} → ${result.action}`);
    } else if (topic === "product.deleted") {
      const result = await handleWooProductDelete(supabase, wooId);
      await supabase.from("woo_sync_logs").insert({
        event_type: "product_webhook_in",
        direction: "in",
        status: result.action === "skipped" ? "skipped" : "success",
        woo_status: topic,
        error_message: result.reason || null,
        payload: { woo_product_id: wooId, action: result.action },
      });
      console.log(`[woocommerce-product-webhook] product ${wooId} deleted → ${result.action}`);
    } else {
      console.log(`[woocommerce-product-webhook] Ignoring unsupported topic: ${topic}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[woocommerce-product-webhook] Error:", msg);
    return new Response(JSON.stringify({ success: false, error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
