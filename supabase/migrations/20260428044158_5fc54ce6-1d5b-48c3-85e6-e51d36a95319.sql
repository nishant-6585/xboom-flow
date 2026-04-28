-- Backfill: populate customer_phone from raw_data when missing.
-- Pulls from billing.phone first, then shipping.phone. Never overwrites
-- an existing non-empty phone.
UPDATE public.woocommerce_orders
SET customer_phone = TRIM(COALESCE(
  NULLIF(raw_data->'billing'->>'phone', ''),
  NULLIF(raw_data->'shipping'->>'phone', '')
))
WHERE (customer_phone IS NULL OR customer_phone = '')
  AND COALESCE(
    NULLIF(raw_data->'billing'->>'phone', ''),
    NULLIF(raw_data->'shipping'->>'phone', '')
  ) IS NOT NULL;