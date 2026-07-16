-- Fix pricelist product dropdown for the sales role.
--
-- Root cause: pricelist_public is a security_invoker view. When the base
-- table lost the "sales can select" policy in migration 20260714101916,
-- the sales role got zero rows from the view too, which emptied the
-- product dropdown in OrderForm.
--
-- Fix: recreate pricelist_public with security_invoker = off (runs with
-- owner privileges), and defensively strip dealer_price so the view only
-- exposes sales-safe columns (no cost_price, no dealer_price, no margin,
-- no procurement fields). GRANT SELECT to authenticated is preserved.

DROP VIEW IF EXISTS public.pricelist_public;

CREATE VIEW public.pricelist_public
WITH (security_invoker = off) AS
SELECT
  id,
  product_name,
  product_category,
  brand,
  description,
  unit_price,
  website_price,
  website_price_includes_gst,
  currency,
  availability,
  lead_time,
  notes,
  marketing_collateral_url,
  marketing_collateral_name,
  min_order_quantity,
  weight_grams,
  woo_product_id,
  woo_sku,
  woo_stock_status,
  sync_source,
  website_synced_at,
  created_at,
  updated_at,
  created_by,
  updated_by
FROM public.pricelist;

GRANT SELECT ON public.pricelist_public TO authenticated;
GRANT SELECT ON public.pricelist_public TO anon;

COMMENT ON VIEW public.pricelist_public IS
  'Sales-safe pricelist view. Runs with owner privileges (security_invoker = off) '
  'so users without a base-table SELECT policy (e.g. plain sales role) still see '
  'products. Excludes cost_price, dealer_price, and all procurement/margin fields.';