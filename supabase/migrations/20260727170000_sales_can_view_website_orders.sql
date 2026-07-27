-- Product decision (2026-07-27): all salespeople should see website-mirrored
-- orders in the All Orders tab so they can open them and raise attribution
-- requests from there — not only via the Website Orders tab / Claim Order tab.
--
-- This relaxes the 20260717095242 scoping for the sales role ONLY for orders
-- with an external_id (website/WooCommerce mirrors — same discriminator the
-- OrderDialog uses for its attribution panel). Reps already see the full
-- woocommerce_orders rows, so this exposes no new customer data. All other
-- orders remain scoped to the rep's own rows; admin / finance / supply_chain /
-- sales_manager access is unchanged.

DROP POLICY IF EXISTS "Users can view orders based on role" ON public.orders;
CREATE POLICY "Users can view orders based on role"
ON public.orders
FOR SELECT
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'finance'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR (
      has_role(auth.uid(), 'sales'::app_role)
      AND (sales_person_id = auth.uid() OR external_id IS NOT NULL)
    )
  )
);
