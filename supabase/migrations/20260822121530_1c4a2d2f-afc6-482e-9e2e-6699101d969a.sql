-- =========================================================================
-- Store the billing address on Shopify orders.
--
-- shopify_orders already carries customer_name, customer_email, customer_phone
-- and shipping_address, but had nowhere to put the billing address — so the
-- order detail dialog could never show it even when Shopify sent it.
-- =========================================================================

ALTER TABLE public.shopify_orders
  ADD COLUMN IF NOT EXISTS billing_address text;

COMMENT ON COLUMN public.shopify_orders.billing_address IS
  'Formatted billing address from the Shopify order payload. NULL when Shopify omits it — most often because the app has not been granted protected customer data access, which redacts name, email, phone, address1, city and zip while leaving province and country intact.';