-- Roll back the redundant Website Pending Payment scaffolding.
-- The existing Orders > XBoom Website tab (woo_orders) already surfaces
-- pending-payment website orders, and Sales > Leads > Xboom Website
-- already surfaces cancelled/abandoned ones. The duplicate trigger,
-- backfilled lead rows, RPCs and grants table are no longer needed.

-- 1. Remove the cancelled-website-order -> leads mirror trigger
DROP TRIGGER IF EXISTS trg_website_cancelled_to_lead ON public.orders;
DROP FUNCTION IF EXISTS public.website_cancelled_to_lead() CASCADE;

-- 2. Remove the orders -> procurement guard trigger added alongside it
DROP TRIGGER IF EXISTS trg_create_procurement_on_website_paid ON public.orders;
DROP FUNCTION IF EXISTS public.create_procurement_on_website_paid() CASCADE;

-- 3. Delete the lead rows that were backfilled from cancelled website orders
DELETE FROM public.leads WHERE form_type = 'website_abandoned';

-- 4. Drop helper RPCs and the grants table
DROP FUNCTION IF EXISTS public.mark_website_order_paid(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.cancel_website_order(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.can_mark_website_payment(uuid) CASCADE;
DROP TABLE IF EXISTS public.payment_marker_grants CASCADE;