-- Add a flag to mark old/expired website leads as "lost" so they're excluded
-- from the active Xboom Website Leads panel but preserved in the database
-- for Orders page history and analytics.
ALTER TABLE public.woocommerce_orders
  ADD COLUMN IF NOT EXISTS is_lost_lead boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lost_lead_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS lost_lead_reason text NULL;

-- Index to make the "exclude lost leads" filter cheap on the leads panel.
CREATE INDEX IF NOT EXISTS idx_woocommerce_orders_active_leads
  ON public.woocommerce_orders (woo_created_at DESC)
  WHERE is_lost_lead = false;

-- Function: mark any lead-status WooCommerce order older than 90 days as lost.
-- A "lead-status" order is any order whose order_status is NOT one of the
-- fulfilled statuses (processing, completed, delivered).
CREATE OR REPLACE FUNCTION public.mark_old_woo_leads_as_lost()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  WITH updated AS (
    UPDATE public.woocommerce_orders
       SET is_lost_lead    = true,
           lost_lead_at    = now(),
           lost_lead_reason = 'auto: lead older than 90 days'
     WHERE is_lost_lead = false
       AND COALESCE(woo_created_at, created_at) < now() - interval '90 days'
       AND lower(COALESCE(order_status, '')) NOT IN ('processing','completed','delivered')
     RETURNING 1
  )
  SELECT count(*) INTO affected FROM updated;

  RETURN affected;
END;
$$;

-- Backfill immediately for existing rows so the panel speeds up right away.
SELECT public.mark_old_woo_leads_as_lost();

-- Schedule the cleanup to run daily at 02:30 UTC.
-- Uses pg_cron (already enabled in this project).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mark-old-woo-leads-as-lost-daily') THEN
    PERFORM cron.unschedule('mark-old-woo-leads-as-lost-daily');
  END IF;
  PERFORM cron.schedule(
    'mark-old-woo-leads-as-lost-daily',
    '30 2 * * *',
    $cron$ SELECT public.mark_old_woo_leads_as_lost(); $cron$
  );
END;
$$;