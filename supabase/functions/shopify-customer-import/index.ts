// Fill in customer details on existing Shopify orders from an admin CSV export.
//
// Why this exists: Shopify only exposes customer PII through the Admin API on
// the Shopify, Advanced and Plus plans. On lower plans every order webhook and
// API read arrives with name, email, phone, street, city and zip stripped —
// province and country survive, which is why stored addresses look like
// "Uttar Pradesh, India". No amount of re-reading the API fixes that.
//
// The admin's own Orders → Export CSV is not subject to that restriction: it is
// a merchant-facing export, not an API read, and it carries the full customer
// block. This endpoint takes the rows parsed from that file and writes them
// onto the matching shopify_orders rows.
//
// Rows are matched on Shopify's numeric order id, falling back to order number,
// and only ever fill fields — see FILL-ONLY below.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** One order's worth of customer detail, already parsed from the CSV. */
interface ImportRow {
  shopify_order_id?: string | null;
  order_number?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_company?: string | null;
  shipping_address?: string | null;
  billing_address?: string | null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const clean = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : null;
};

/**
 * Does the stored name look like the ingest's placeholder rather than a person?
 *
 * mapShopifyToShopifyOrder falls back to "Shopify Order <n>" when every name
 * source in the payload is empty, so that exact string means "Shopify sent no
 * name" and is safe to overwrite.
 */
function isPlaceholderName(
  name: string | null,
  orderNumber: string | null,
  shopifyOrderId: string | null,
): boolean {
  if (!name) return true;
  return (
    name === `Shopify Order ${orderNumber}` ||
    name === `Shopify Order ${shopifyOrderId}`
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method === "GET") {
    return new Response("shopify-customer-import is live", {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // --- Authentication ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }
  const userClient = createClient(supabaseUrl, anonKey);
  const { data: claimsData, error: claimsError } = await userClient.auth
    .getClaims(authHeader.replace("Bearer ", ""));
  if (claimsError || !claimsData?.claims?.sub) {
    return json({ error: "Unauthorized" }, 401);
  }
  const userId = claimsData.claims.sub as string;

  // --- Authorization: admin only. This writes customer PII across the order
  // table, so it is deliberately not open to the wider sales roles. ---
  const service = createClient(supabaseUrl, serviceRoleKey);
  const { data: roles } = await service
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin");
  if (!roles || roles.length === 0) {
    console.warn(`Forbidden: non-admin ${userId} attempted customer import`);
    return json({ error: "Forbidden: admin access required" }, 403);
  }

  let rows: ImportRow[] = [];
  try {
    const body = await req.json();
    rows = Array.isArray(body?.rows) ? body.rows : [];
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (rows.length === 0) return json({ error: "No rows supplied" }, 400);
  if (rows.length > 5000) {
    return json({ error: "Too many rows in one request (max 5000)" }, 400);
  }

  const dryRun = await (async () => {
    try {
      return (await req.clone().json())?.dry_run === true;
    } catch {
      return false;
    }
  })();

  let matched = 0;
  let updated = 0;
  let unmatched = 0;
  let skipped = 0;
  const unmatchedRefs: string[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    const shopifyOrderId = clean(row.shopify_order_id);
    const orderNumber = clean(row.order_number);
    if (!shopifyOrderId && !orderNumber) {
      skipped++;
      continue;
    }

    // Shopify's numeric id is the stable key; order_number is a display value
    // and only used when the export lacks the id column.
    let query = service
      .from("shopify_orders")
      .select(
        "id, customer_name, customer_email, customer_phone, customer_company, " +
          "shipping_address, billing_address, order_number, shopify_order_id",
      );
    query = shopifyOrderId
      ? query.eq("shopify_order_id", shopifyOrderId)
      : query.eq("order_number", orderNumber!);

    const { data: existing, error: findError } = await query.limit(1);
    if (findError) {
      errors.push(`lookup ${shopifyOrderId ?? orderNumber}: ${findError.message}`);
      continue;
    }
    if (!existing || existing.length === 0) {
      unmatched++;
      if (unmatchedRefs.length < 25) {
        unmatchedRefs.push(shopifyOrderId ?? orderNumber!);
      }
      continue;
    }
    matched++;

    const current = existing[0];
    const patch: Record<string, string> = {};

    // FILL-ONLY: never overwrite a value someone already has. The CSV is a
    // repair for redacted rows, not a source of truth — if staff have since
    // corrected a name or phone by hand, or a later order webhook carried real
    // data, that wins. The one exception is the "Shopify Order <n>" placeholder,
    // which is by definition not a real name.
    const name = clean(row.customer_name);
    if (
      name &&
      isPlaceholderName(
        current.customer_name,
        current.order_number,
        current.shopify_order_id,
      )
    ) {
      patch.customer_name = name;
    }

    const fillIfBlank = (field: keyof ImportRow, column: string) => {
      const incoming = clean(row[field] as string | null | undefined);
      const held = clean(current[column as keyof typeof current] as string | null);
      if (incoming && !held) patch[column] = incoming;
    };

    fillIfBlank("customer_email", "customer_email");
    fillIfBlank("customer_phone", "customer_phone");
    fillIfBlank("customer_company", "customer_company");
    fillIfBlank("shipping_address", "shipping_address");
    fillIfBlank("billing_address", "billing_address");

    if (Object.keys(patch).length === 0) {
      skipped++;
      continue;
    }
    if (dryRun) {
      updated++;
      continue;
    }

    const { error: updateError } = await service
      .from("shopify_orders")
      .update(patch)
      .eq("id", current.id);
    if (updateError) {
      errors.push(`update ${current.id}: ${updateError.message}`);
      continue;
    }
    updated++;
  }

  console.log("[shopify-customer-import]", {
    by: userId,
    dry_run: dryRun,
    supplied: rows.length,
    matched,
    updated,
    unmatched,
    skipped,
    errors: errors.length,
  });

  return json({
    success: true,
    dry_run: dryRun,
    supplied: rows.length,
    matched,
    updated,
    unmatched,
    skipped,
    unmatched_sample: unmatchedRefs,
    errors: errors.slice(0, 20),
  });
});
