// Read-only product catalog for the Mikee reception robot's kiosk (TimoDesk
// spine) — the browse/search half of robot-lead-incoming. Same mandatory
// HMAC-SHA256 auth (x-xbm-signature over the raw POST body). Serves ONLY
// kiosk-safe pricelist columns: website_price is the one public price;
// cost_price / dealer_price / unit_price and internal notes never leave.
// Search-first by design: the catalog is thousands of rows, so the kiosk
// sends {search, limit, offset} and we page server-side.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-xbm-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (clean.length % 2 !== 0) return new Uint8Array();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function verifyHmac(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  const match = signatureHeader.match(/^sha256=([a-fA-F0-9]+)$/);
  if (!match) return false;
  const expected = hexToBytes(match[1]);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  return timingSafeEqual(expected, new Uint8Array(sigBuf));
}

// Kiosk-safe columns only. Deliberately NOT unit_price / cost_price /
// dealer_price / notes / created_by / updated_by.
const KIOSK_COLUMNS =
  "id, product_name, product_category, brand, description, website_price, " +
  "website_price_includes_gst, currency, availability, woo_sku, " +
  "min_order_quantity, lead_time";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "method not allowed" }, 405);
  }

  const rawBody = await req.text();

  const sigHeader = req.headers.get("x-xbm-signature");
  const secret = Deno.env.get("ROBOT_WEBHOOK_SECRET");
  if (!secret) {
    console.error("[robot-catalog] ROBOT_WEBHOOK_SECRET not configured");
    return json({ ok: false, error: "server misconfigured" }, 500);
  }
  if (!sigHeader) {
    return json({ ok: false, error: "missing signature" }, 401);
  }
  const sigOk = await verifyHmac(rawBody, sigHeader, secret);
  if (!sigOk) return json({ ok: false, error: "invalid signature" }, 401);

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }
  if (!body || typeof body !== "object") {
    return json({ ok: false, error: "body must be an object" }, 400);
  }

  const search = (typeof body.search === "string" ? body.search : "").trim().slice(0, 120);
  const limit = Math.max(
    1,
    Math.min(50, typeof body.limit === "number" ? Math.round(body.limit) : 30),
  );
  const offset = Math.max(
    0,
    Math.min(10_000, typeof body.offset === "number" ? Math.round(body.offset) : 0),
  );

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let query = supabase
    .from("pricelist")
    .select(KIOSK_COLUMNS, { count: "exact" })
    .neq("availability", "Out of Stock")
    .order("product_name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (search) {
    // Escape PostgREST or-filter specials so visitor input can't break the query.
    const term = search.replace(/[%_,().]/g, " ").trim();
    if (term) {
      query = query.or(
        `product_name.ilike.%${term}%,brand.ilike.%${term}%,product_category.ilike.%${term}%`,
      );
    }
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("[robot-catalog] query failed", error);
    return json({ ok: false, error: "query_failed" }, 500);
  }

  return json({
    ok: true,
    products: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
});
