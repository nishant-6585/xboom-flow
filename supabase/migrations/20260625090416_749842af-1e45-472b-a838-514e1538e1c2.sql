-- Track which fields on an order have been manually edited in the internal app,
-- so the WooCommerce mirror won't overwrite them on subsequent webhook/backfill syncs.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS manual_overrides text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.orders.manual_overrides IS
  'Field names that have been manually edited in the internal ERP. The woo-mirror edge function will not overwrite these columns on website-source orders.';
