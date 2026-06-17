-- =====================================================
-- WooCommerce → Pricelist product sync
-- Adds the columns needed to key/track website-sourced products, extends the
-- public view, and schedules a daily reconcile via pg_cron.
-- =====================================================

-- 1. Tracking columns on pricelist ---------------------------------------------
ALTER TABLE public.pricelist ADD COLUMN IF NOT EXISTS woo_product_id BIGINT;
ALTER TABLE public.pricelist ADD COLUMN IF NOT EXISTS woo_sku TEXT;
ALTER TABLE public.pricelist ADD COLUMN IF NOT EXISTS sync_source TEXT;
ALTER TABLE public.pricelist ADD COLUMN IF NOT EXISTS website_synced_at TIMESTAMPTZ;

-- One pricelist row per WooCommerce product (partial: manual rows stay NULL).
CREATE UNIQUE INDEX IF NOT EXISTS pricelist_woo_product_id_key
  ON public.pricelist (woo_product_id)
  WHERE woo_product_id IS NOT NULL;

-- 2. Refresh the public view so non-cost roles also see sync metadata ----------
-- (security_invoker is preserved so the querying user's RLS still applies.)
DROP VIEW IF EXISTS public.pricelist_public;
CREATE VIEW public.pricelist_public
WITH (security_invoker = on) AS
SELECT
  id, product_name, product_category, brand, description,
  unit_price, website_price, dealer_price, currency, availability,
  lead_time, notes, marketing_collateral_url, marketing_collateral_name,
  min_order_quantity, created_at, updated_at, created_by, updated_by,
  woo_product_id, woo_sku, sync_source, website_synced_at
FROM public.pricelist;

GRANT SELECT ON public.pricelist_public TO authenticated;

-- 3. Daily reconcile cron ------------------------------------------------------
-- Re-pulls the full Woo catalog once a day as a safety net for missed webhooks.
CREATE OR REPLACE FUNCTION public.invoke_woocommerce_products_backfill()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_secret     text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'CRON_SECRET'
  LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE NOTICE 'CRON_SECRET missing from vault; skipping woocommerce-products-backfill invocation';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/woocommerce-products-backfill',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', v_secret
    ),
    body    := jsonb_build_object('triggered_by', 'cron', 'time', now())
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_woocommerce_products_backfill() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_woocommerce_products_backfill() TO postgres;

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'woocommerce-products-reconcile';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;

  -- 01:30 UTC daily (07:00 IST) — off-peak.
  PERFORM cron.schedule(
    'woocommerce-products-reconcile',
    '30 1 * * *',
    $cmd$ SELECT public.invoke_woocommerce_products_backfill(); $cmd$
  );
END $$;
