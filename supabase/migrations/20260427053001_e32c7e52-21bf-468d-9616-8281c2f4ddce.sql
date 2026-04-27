-- 1. Add bucket column with classification
ALTER TABLE public.woocommerce_orders
  ADD COLUMN IF NOT EXISTS bucket text NOT NULL DEFAULT 'abandoned'
    CHECK (bucket IN ('orders', 'abandoned'));

-- 2. Backfill bucket from existing order_status
UPDATE public.woocommerce_orders
SET bucket = CASE
  WHEN order_status IN ('processing', 'completed') THEN 'orders'
  ELSE 'abandoned'
END;

CREATE INDEX IF NOT EXISTS idx_woocommerce_orders_bucket
  ON public.woocommerce_orders (bucket);

-- 3. Archive abandoned_carts before drop
CREATE TABLE IF NOT EXISTS public.abandoned_carts_archive AS
  TABLE public.abandoned_carts;

-- Make archive read-only via RLS
ALTER TABLE public.abandoned_carts_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view archived carts" ON public.abandoned_carts_archive;
CREATE POLICY "Admins can view archived carts"
  ON public.abandoned_carts_archive
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Remove pg_cron jobs targeting auto-recover-carts (if any)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobname)
    FROM cron.job
    WHERE command ILIKE '%auto-recover-carts%'
       OR command ILIKE '%sync-abandoned-carts%'
       OR command ILIKE '%recover-abandoned-cart%';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron unschedule skipped: %', SQLERRM;
END $$;

-- 5. Drop abandoned_carts table (cascades dependent FKs/policies/triggers)
DROP TABLE IF EXISTS public.abandoned_carts CASCADE;