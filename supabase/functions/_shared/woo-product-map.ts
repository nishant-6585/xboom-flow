/**
 * Shared WooCommerce → pricelist product mapping.
 *
 * Used by both the real-time `woocommerce-product-webhook` and the
 * `woocommerce-products-backfill` (REST pull + daily cron reconcile).
 *
 * Design rules:
 *  - Matching: by `woo_product_id` first, then by exact (case-insensitive)
 *    `product_name` for rows that were created manually (woo_product_id IS NULL),
 *    so the first sync LINKS existing rows instead of duplicating them.
 *  - Website sync owns ONLY website-sourced fields (name, category, description,
 *    website_price, availability, sku). Internal pricing — cost_price,
 *    dealer_price, unit_price — is NEVER written here and is always preserved.
 *  - Variable products are handled "parent only": one pricelist row per product,
 *    using the parent's price (Woo reports the min variation price in `price`).
 */

// Canonical categories used by the pricelist UI. A Woo category that matches one
// of these (case-insensitive) is normalised to the canonical label; otherwise the
// raw Woo category name is kept as-is (pricelist.product_category is free text).
const KNOWN_CATEGORIES = [
  "Consumer Drones",
  "Enterprise Drones",
  "Agriculture Drones",
  "Accessories",
  "Batteries",
  "Payloads",
  "Software",
  "Services",
];

// deno-lint-ignore no-explicit-any
type Woo = any;
// deno-lint-ignore no-explicit-any
type Supabase = any;

export interface UpsertResult {
  action: "created" | "updated" | "linked" | "skipped";
  id?: string;
  reason?: string;
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function mapCategory(woo: Woo): string {
  const raw = Array.isArray(woo?.categories) && woo.categories.length > 0
    ? String(woo.categories[0]?.name || "").trim()
    : "";
  if (!raw) return "Consumer Drones";
  const match = KNOWN_CATEGORIES.find((c) => c.toLowerCase() === raw.toLowerCase());
  return match || raw;
}

function mapAvailability(woo: Woo): string {
  switch (String(woo?.stock_status || "").toLowerCase()) {
    case "instock":
      return "In Stock";
    case "outofstock":
      return "Out of Stock";
    case "onbackorder":
      return "Pre-Order";
    default:
      // Unknown / missing stock_status -> don't masquerade as in-stock.
      return "On Request";
  }
}

/**
 * Website price = the standard catalog price. We prefer `regular_price` for
 * stability (so a temporary sale doesn't churn the pricelist), falling back to
 * `price` — which also covers variable products where the parent `regular_price`
 * is blank and `price` holds the min variation price.
 */
function mapPrice(woo: Woo): number | null {
  const candidate = woo?.regular_price || woo?.price || woo?.sale_price || "";
  const n = parseFloat(String(candidate));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** True when the product is publicly visible/published on the website. */
export function isPublished(woo: Woo): boolean {
  const status = String(woo?.status || "publish").toLowerCase();
  return status === "publish";
}

/**
 * Upsert a single WooCommerce product into the pricelist.
 * `source` is recorded on woo_sync_logs by the caller; here it sets sync_source.
 */
export async function upsertWooProduct(
  supabase: Supabase,
  woo: Woo,
  source: string,
): Promise<UpsertResult> {
  const wooId = Number(woo?.id);
  if (!wooId || Number.isNaN(wooId)) {
    return { action: "skipped", reason: "missing woo product id" };
  }

  const name = String(woo?.name || "").trim();
  if (!name) return { action: "skipped", reason: "missing product name" };

  // Non-published products: don't create new rows. If a row already exists,
  // mark it unavailable but keep its internal pricing/history.
  if (!isPublished(woo)) {
    const { data: existing } = await supabase
      .from("pricelist")
      .select("id")
      .eq("woo_product_id", wooId)
      .maybeSingle();
    if (existing?.id) {
      await supabase
        .from("pricelist")
        .update({ availability: "Out of Stock", website_synced_at: new Date().toISOString() })
        .eq("id", existing.id);
      return { action: "updated", id: existing.id, reason: "unpublished → out of stock" };
    }
    return { action: "skipped", reason: `status=${woo?.status}` };
  }

  const websiteFields: Record<string, unknown> = {
    woo_product_id: wooId,
    product_name: name,
    product_category: mapCategory(woo),
    description: stripHtml(woo?.short_description || woo?.description) || null,
    website_price: mapPrice(woo),
    availability: mapAvailability(woo),
    woo_stock_status: woo?.stock_status ? String(woo.stock_status).toLowerCase() : null,
    woo_sku: woo?.sku ? String(woo.sku) : null,
    sync_source: source,
    website_synced_at: new Date().toISOString(),
  };

  // 1) Match by woo_product_id
  const { data: byId } = await supabase
    .from("pricelist")
    .select("id")
    .eq("woo_product_id", wooId)
    .maybeSingle();

  if (byId?.id) {
    const { error } = await supabase.from("pricelist").update(websiteFields).eq("id", byId.id);
    if (error) throw new Error(error.message);
    return { action: "updated", id: byId.id };
  }

  // 2) Fallback: link an existing manually-entered row by exact name
  //    (only rows not already owned by another Woo product).
  const { data: byName } = await supabase
    .from("pricelist")
    .select("id")
    .is("woo_product_id", null)
    .ilike("product_name", name)
    .limit(1);

  if (byName && byName.length > 0) {
    const { error } = await supabase.from("pricelist").update(websiteFields).eq("id", byName[0].id);
    if (error) throw new Error(error.message);
    return { action: "linked", id: byName[0].id };
  }

  // 3) New product
  const { data: inserted, error } = await supabase
    .from("pricelist")
    .insert(websiteFields)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { action: "created", id: inserted?.id };
}

/** WooCommerce product.deleted — soft handle: mark out of stock, keep the row. */
export async function handleWooProductDelete(
  supabase: Supabase,
  wooId: number,
): Promise<UpsertResult> {
  if (!wooId) return { action: "skipped", reason: "missing woo product id" };
  const { data: existing } = await supabase
    .from("pricelist")
    .select("id")
    .eq("woo_product_id", wooId)
    .maybeSingle();
  if (!existing?.id) return { action: "skipped", reason: "not found" };
  const { error } = await supabase
    .from("pricelist")
    .update({ availability: "Out of Stock", website_synced_at: new Date().toISOString() })
    .eq("id", existing.id);
  if (error) throw new Error(error.message);
  return { action: "updated", id: existing.id, reason: "deleted on website" };
}
