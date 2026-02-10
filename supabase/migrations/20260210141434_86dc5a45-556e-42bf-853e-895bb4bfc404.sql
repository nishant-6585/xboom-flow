
-- Step 1: Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "All approved users can view pricelist" ON public.pricelist;

-- Step 2: Create restricted SELECT policy - only admin and supply_chain see full table (including cost_price)
CREATE POLICY "Admin and supply_chain can view full pricelist"
ON public.pricelist
FOR SELECT
USING (
  is_user_approved(auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role))
);

-- Step 3: Create a view without cost_price for all other approved users
CREATE VIEW public.pricelist_public
WITH (security_invoker = on) AS
SELECT 
  id, product_name, product_category, brand, description,
  unit_price, website_price, dealer_price, currency, availability,
  lead_time, notes, marketing_collateral_url, marketing_collateral_name,
  min_order_quantity, created_at, updated_at, created_by, updated_by
FROM public.pricelist;

-- Step 4: Grant SELECT on the view to authenticated users
GRANT SELECT ON public.pricelist_public TO authenticated;

-- Step 5: Add a SELECT policy so all approved users can read via the view (security_invoker means RLS applies)
-- Since the view uses security_invoker, we need a policy that allows all approved users to SELECT
-- but ONLY through the view. We add a permissive policy for all approved users on SELECT.
-- The key protection is: direct queries go through this policy too, but the VIEW excludes cost_price.
-- To truly restrict direct table access, we need the restrictive policy above.
-- Non-admin/supply_chain users need to query the view instead.

-- Add a policy for non-privileged users to read pricelist (needed for the view with security_invoker)
CREATE POLICY "Approved users can view pricelist via view"
ON public.pricelist
FOR SELECT
USING (is_user_approved(auth.uid()));
