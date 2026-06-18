import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const API_VERSION = "2025-01";

interface PushBody {
  shopify_order_id: string;
  shop_domain?: string;
  order_status?: string | null;
  fulfillment_status?: string | null;
  payment_status?: string | null;
  cancel_reason?: string | null;
}

interface ActionResult {
  action: string;
  ok: boolean;
  status?: number;
  error?: string;
  detail?: unknown;
}

function token() {
  const t = Deno.env.get("SHOPIFY_ADMIN_API_TOKEN");
  if (!t) throw new Error("SHOPIFY_ADMIN_API_TOKEN not configured");
  return t;
}

function resolveShop(shopOverride?: string) {
  const shop = shopOverride || Deno.env.get("SHOPIFY_STORE_DOMAIN");
  if (!shop) throw new Error("SHOPIFY_STORE_DOMAIN not configured");
  return shop.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

async function shopifyFetch(
  shop: string,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = `https://${shop}/admin/api/${API_VERSION}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": token(),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  let body: unknown = null;
  const text = await res.text();
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

async function applyOrderStatus(
  shop: string,
  orderId: string,
  status: string,
  cancelReason?: string | null,
): Promise<ActionResult> {
  const s = status.toLowerCase();
  if (s === "closed") {
    const r = await shopifyFetch(shop, `/orders/${orderId}/close.json`, { method: "POST" });
    return { action: "order_status:closed", ok: r.ok, status: r.status, error: r.ok ? undefined : `Shopify ${r.status}`, detail: r.ok ? undefined : r.body };
  }
  if (s === "open") {
    const r = await shopifyFetch(shop, `/orders/${orderId}/open.json`, { method: "POST" });
    return { action: "order_status:open", ok: r.ok, status: r.status, error: r.ok ? undefined : `Shopify ${r.status}`, detail: r.ok ? undefined : r.body };
  }
  if (s === "cancelled" || s === "canceled") {
    const r = await shopifyFetch(shop, `/orders/${orderId}/cancel.json`, {
      method: "POST",
      body: JSON.stringify({ reason: cancelReason || "other" }),
    });
    return { action: "order_status:cancelled", ok: r.ok, status: r.status, error: r.ok ? undefined : `Shopify ${r.status}`, detail: r.ok ? undefined : r.body };
  }
  if (s === "on_hold") {
    return { action: "order_status:on_hold", ok: false, error: "Shopify has no direct on_hold transition; manage via fulfillment hold in Shopify admin" };
  }
  return { action: `order_status:${s}`, ok: false, error: "Unsupported order_status" };
}

async function applyFulfillment(
  shop: string,
  orderId: string,
  status: string,
): Promise<ActionResult> {
  const s = status.toLowerCase();
  if (s === "fulfilled" || s === "shipped" || s === "delivered") {
    // Fetch open fulfillment orders for this order
    const fo = await shopifyFetch(shop, `/orders/${orderId}/fulfillment_orders.json`);
    if (!fo.ok) return { action: `fulfillment:${s}`, ok: false, status: fo.status, error: "Failed to load fulfillment_orders", detail: fo.body };
    // deno-lint-ignore no-explicit-any
    const list = ((fo.body as any)?.fulfillment_orders ?? []) as Array<{ id: number; status: string; line_items: Array<{ id: number; fulfillable_quantity: number }> }>;
    const eligible = list.filter(f => f.status === "open" || f.status === "in_progress" || f.status === "scheduled");
    if (eligible.length === 0) {
      return { action: `fulfillment:${s}`, ok: true, status: 200, detail: "no open fulfillment orders (already fulfilled)" };
    }
    const line_items_by_fulfillment_order = eligible.map(f => ({
      fulfillment_order_id: f.id,
      // omit fulfillment_order_line_items → fulfill all remaining quantities
    }));
    const r = await shopifyFetch(shop, `/fulfillments.json`, {
      method: "POST",
      body: JSON.stringify({
        fulfillment: {
          notify_customer: false,
          line_items_by_fulfillment_order,
        },
      }),
    });
    return { action: `fulfillment:${s}`, ok: r.ok, status: r.status, error: r.ok ? undefined : `Shopify ${r.status}`, detail: r.ok ? undefined : r.body };
  }
  if (s === "cancelled" || s === "canceled") {
    const fl = await shopifyFetch(shop, `/orders/${orderId}/fulfillments.json`);
    if (!fl.ok) return { action: "fulfillment:cancelled", ok: false, status: fl.status, error: "Failed to load fulfillments", detail: fl.body };
    // deno-lint-ignore no-explicit-any
    const fulfillments = ((fl.body as any)?.fulfillments ?? []) as Array<{ id: number; status: string }>;
    const targets = fulfillments.filter(f => f.status !== "cancelled");
    if (targets.length === 0) {
      return { action: "fulfillment:cancelled", ok: true, status: 200, detail: "no active fulfillments" };
    }
    const results: Array<{ id: number; ok: boolean; status: number }> = [];
    for (const t of targets) {
      const r = await shopifyFetch(shop, `/fulfillments/${t.id}/cancel.json`, { method: "POST" });
      results.push({ id: t.id, ok: r.ok, status: r.status });
    }
    const allOk = results.every(r => r.ok);
    return { action: "fulfillment:cancelled", ok: allOk, detail: results };
  }
  if (s === "unfulfilled" || s === "partial") {
    return { action: `fulfillment:${s}`, ok: false, error: `Cannot push '${s}' to Shopify — it is derived from fulfillment events` };
  }
  return { action: `fulfillment:${s}`, ok: false, error: "Unsupported fulfillment_status" };
}

async function applyPayment(
  shop: string,
  orderId: string,
  status: string,
): Promise<ActionResult> {
  const s = status.toLowerCase();
  if (s === "full" || s === "paid") {
    // Try capture first; if no authorized amount, fall back to a "sale" via order transactions list inspection.
    const tx = await shopifyFetch(shop, `/orders/${orderId}/transactions.json`);
    // deno-lint-ignore no-explicit-any
    const transactions = ((tx.body as any)?.transactions ?? []) as Array<{ id: number; kind: string; status: string; amount: string; gateway: string }>;
    const authorization = transactions.find(t => t.kind === "authorization" && t.status === "success");
    if (authorization) {
      const r = await shopifyFetch(shop, `/orders/${orderId}/transactions.json`, {
        method: "POST",
        body: JSON.stringify({
          transaction: {
            kind: "capture",
            parent_id: authorization.id,
            amount: authorization.amount,
          },
        }),
      });
      return { action: "payment:full(capture)", ok: r.ok, status: r.status, error: r.ok ? undefined : `Shopify ${r.status}`, detail: r.ok ? undefined : r.body };
    }
    // Else mark as paid (manual sale) — fetch order total
    const ord = await shopifyFetch(shop, `/orders/${orderId}.json`);
    // deno-lint-ignore no-explicit-any
    const order = (ord.body as any)?.order;
    if (!ord.ok || !order) return { action: "payment:full", ok: false, status: ord.status, error: "Failed to load order for payment", detail: ord.body };
    const r = await shopifyFetch(shop, `/orders/${orderId}/transactions.json`, {
      method: "POST",
      body: JSON.stringify({
        transaction: {
          kind: "sale",
          status: "success",
          amount: order.total_outstanding ?? order.total_price,
          gateway: "manual",
        },
      }),
    });
    return { action: "payment:full(manual)", ok: r.ok, status: r.status, error: r.ok ? undefined : `Shopify ${r.status}`, detail: r.ok ? undefined : r.body };
  }
  if (s === "voided") {
    const tx = await shopifyFetch(shop, `/orders/${orderId}/transactions.json`);
    // deno-lint-ignore no-explicit-any
    const transactions = ((tx.body as any)?.transactions ?? []) as Array<{ id: number; kind: string; status: string }>;
    const authorization = transactions.find(t => t.kind === "authorization" && t.status === "success");
    if (!authorization) return { action: "payment:voided", ok: false, error: "No successful authorization to void" };
    const r = await shopifyFetch(shop, `/orders/${orderId}/transactions.json`, {
      method: "POST",
      body: JSON.stringify({ transaction: { kind: "void", parent_id: authorization.id } }),
    });
    return { action: "payment:voided", ok: r.ok, status: r.status, error: r.ok ? undefined : `Shopify ${r.status}`, detail: r.ok ? undefined : r.body };
  }
  if (s === "refunded" || s === "partial") {
    return { action: `payment:${s}`, ok: false, error: `Refunds must be issued from Shopify admin (need line items & restock decisions)` };
  }
  if (s === "pending") {
    return { action: "payment:pending", ok: true, detail: "no-op (cannot un-capture in Shopify)" };
  }
  return { action: `payment:${s}`, ok: false, error: "Unsupported payment_status" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const jwt = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(jwt);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as PushBody;
    if (!body.shopify_order_id) {
      return new Response(JSON.stringify({ error: "shopify_order_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const shop = resolveShop(body.shop_domain);
    const orderId = String(body.shopify_order_id);
    const results: ActionResult[] = [];

    if (body.order_status) {
      try { results.push(await applyOrderStatus(shop, orderId, body.order_status, body.cancel_reason)); }
      catch (e) { results.push({ action: "order_status", ok: false, error: (e as Error).message }); }
    }
    if (body.fulfillment_status) {
      try { results.push(await applyFulfillment(shop, orderId, body.fulfillment_status)); }
      catch (e) { results.push({ action: "fulfillment", ok: false, error: (e as Error).message }); }
    }
    if (body.payment_status) {
      try { results.push(await applyPayment(shop, orderId, body.payment_status)); }
      catch (e) { results.push({ action: "payment", ok: false, error: (e as Error).message }); }
    }

    const allOk = results.length === 0 ? true : results.every(r => r.ok);
    console.log(`[shopify-push-update] order=${orderId} results=`, JSON.stringify(results));

    return new Response(JSON.stringify({ ok: allOk, results }), {
      status: allOk ? 200 : 207,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[shopify-push-update] error", err);
    return new Response(JSON.stringify({ error: (err as Error).message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});