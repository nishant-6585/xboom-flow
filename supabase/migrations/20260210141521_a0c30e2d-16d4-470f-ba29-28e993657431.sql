
-- Drop the problematic broad policy that negates the restriction
DROP POLICY IF EXISTS "Approved users can view pricelist via view" ON public.pricelist;

-- Drop the security_invoker view and recreate without it
-- A regular view (security_definer, the default) runs as the view owner,
-- bypassing RLS on the base table. This means:
-- - Direct queries to 'pricelist' table: blocked for non-admin/supply_chain by RLS
-- - Queries to 'pricelist_public' view: allowed for all authenticated users, but cost_price is excluded
DROP VIEW IF EXISTS public.pricelist_public;

CREATE VIEW public.pricelist_public AS
SELECT 
  id, product_name, product_category, brand, description,
  unit_price, website_price, dealer_price, currency, availability,
  lead_time, notes, marketing_collateral_url, marketing_collateral_name,
  min_order_quantity, created_at, updated_at, created_by, updated_by
FROM public.pricelist;

GRANT SELECT ON public.pricelist_public TO authenticated;
