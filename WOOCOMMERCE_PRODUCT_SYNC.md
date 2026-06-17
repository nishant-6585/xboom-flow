# WooCommerce Product Sync (xboom.in → Pricelist)

Syncs products from the WooCommerce store at **xboom.in** into the internal
**Product Pricelist**. New products are added and price/availability changes are
applied automatically. Internal pricing (`cost_price`, `dealer_price`,
`unit_price`) is **never** overwritten by the website sync.

## How it works

| Path | Trigger | Function | Auth |
|------|---------|----------|------|
| Real-time | WooCommerce webhook on product create/update/delete | `woocommerce-product-webhook` | HMAC-SHA256 |
| Manual | "Sync from Website" button on the Pricelist page (Admin / Supply Chain) | `woocommerce-products-backfill` | JWT (admin/supply_chain) |
| Daily reconcile | pg_cron at 01:30 UTC (07:00 IST) | `woocommerce-products-backfill` | `X-Cron-Secret` (Vault) |

The daily reconcile is a safety net: it re-pulls the full published catalog so any
webhook delivery that was missed is caught within 24h.

### Field mapping (Woo → pricelist)

| Woo field | pricelist column |
|-----------|------------------|
| `id` | `woo_product_id` (upsert key) |
| `name` | `product_name` |
| `categories[0].name` | `product_category` (normalised to a known category if it matches, else kept as-is) |
| `regular_price` → `price` fallback | `website_price` |
| `short_description` / `description` (HTML stripped) | `description` |
| `stock_status` (`instock`/`outofstock`/`onbackorder`) | `availability` |
| `sku` | `woo_sku` |

- **Matching:** by `woo_product_id` first; on the first sync, an existing
  manually-entered row with the same name (and no `woo_product_id`) is **linked**
  instead of duplicated.
- **Variable products:** handled parent-only — one pricelist row per product,
  using the parent's price.
- **Unpublished / deleted:** the row is marked `Out of Stock` and kept (its
  internal pricing/history is preserved); it is not hard-deleted.

## One-time setup

### 1. Secrets (reused from the order sync — should already exist)

| Secret | Used by |
|--------|---------|
| `WOOCOMMERCE_WEBHOOK_SECRET` | webhook HMAC verification |
| `WC_SITE_URL` (e.g. `https://xboom.in`) | backfill / reconcile REST pull |
| `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET` | backfill / reconcile REST pull |
| `CRON_SECRET` (Vault) | daily reconcile job |

### 2. Register the WooCommerce webhooks

In **WooCommerce → Settings → Advanced → Webhooks**, add three webhooks (or one
per topic), each:

- **Status:** Active
- **Topic:** `Product created`, `Product updated`, `Product deleted`
- **Delivery URL:** `https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/woocommerce-product-webhook`
- **Secret:** the same value as `WOOCOMMERCE_WEBHOOK_SECRET`
- **API version:** WP REST API Integration v3

### 3. Initial population

After deploy, open the **Pricelist** page (as Admin or Supply Chain) and click
**Sync from Website** once to import the existing catalog. The daily cron keeps it
in sync thereafter.

## Observability

All sync activity is logged to `woo_sync_logs` (`event_type` =
`product_webhook_in`, `product_backfill`, `product_hmac_fail`). The backfill also
records a summary row with `{created, updated, linked, skipped, failed}`.
